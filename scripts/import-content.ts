/**
 * Import Learn articles from YAML into the content_modules table.
 *
 * Reads:
 *   content/modules/free/*.yaml      → tier = free
 *   content/modules/premium/*.yaml   → tier = premium
 *
 *   npm run import-content            # write to the database
 *   npm run import-content -- --dry-run   # validate only, no DB writes
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 * (loaded from .env.local or .env).
 *
 * ─── This script does not publish anything ────────────────────────────────
 *
 * It used to. `published_at` in the file was the whole publishing process:
 * write the article, set the date, run the import, and a woman read it —
 * with nobody but the author having read it first.
 *
 * Since 035_content_review.sql an article is only readable once a named admin
 * has approved that exact wording in /admin/articles, and RLS enforces it.
 * So this script:
 *
 *   • never sets review_status on an article that already exists — approval
 *     is not something a file can assert;
 *   • only sets it on a brand new article, and only to 'draft' or 'in_review';
 *   • warns loudly when an edit will withdraw an existing approval, because
 *     that quietly takes a live article down until it is re-read.
 */

import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { editRevokesApproval, type ReviewStatus } from '../src/lib/article-review'

dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

const MODULES_DIR = path.join(process.cwd(), 'content/modules')
const TIERS = ['free', 'premium'] as const
type Tier = (typeof TIERS)[number]

/** The only states a file may ask for on a new article. */
const AUTHORABLE_STATUSES: ReviewStatus[] = ['draft', 'in_review']

interface ArticleFile {
  slug?: string
  title?: string
  category?: string
  body_md?: string
  tags?: string[]
  estimated_read_minutes?: number
  published_at?: string | null
  tier?: string
  review_status?: string
}

interface ParsedArticle {
  slug: string
  title: string
  category: string
  body_md: string
  tags: string[]
  estimated_read_minutes: number | null
  /** Only applied when the article is new. */
  review_status: ReviewStatus
  /**
   * Undefined when the file does not mention it. An absent date must not
   * overwrite one the article already has — approving an article sets its
   * publication date, and a re-import should not undo that.
   */
  published_at?: string | null
  tier: Tier
}

const isDryRun = process.argv.includes('--dry-run')

function loadArticles(): { articles: ParsedArticle[]; errors: string[] } {
  const articles: ParsedArticle[] = []
  const errors: string[] = []
  const seenSlugs = new Map<string, string>()

  for (const tier of TIERS) {
    const dir = path.join(MODULES_DIR, tier)
    if (!fs.existsSync(dir)) continue

    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.yaml'))

    for (const file of files) {
      const where = `${tier}/${file}`
      let raw: ArticleFile
      try {
        raw = yaml.load(fs.readFileSync(path.join(dir, file), 'utf8')) as ArticleFile
      } catch (e) {
        errors.push(`[${where}] YAML parse error: ${(e as Error).message}`)
        continue
      }

      if (!raw || typeof raw !== 'object') {
        errors.push(`[${where}] File is empty or not a YAML object`)
        continue
      }
      for (const field of ['slug', 'title', 'category', 'body_md'] as const) {
        if (!raw[field] || String(raw[field]).trim() === '') {
          errors.push(`[${where}] Missing required field: ${field}`)
        }
      }
      if (raw.tier !== undefined) {
        errors.push(`[${where}] Remove the \`tier\` field — tier is set by the folder (${tier})`)
      }

      // A file may say an article is a draft or ready to be read. It may not
      // say an article has been approved: approval is a person reading it and
      // signing it off in /admin/articles, and nothing else.
      let reviewStatus: ReviewStatus = 'in_review'
      if (raw.review_status !== undefined) {
        if (AUTHORABLE_STATUSES.includes(raw.review_status as ReviewStatus)) {
          reviewStatus = raw.review_status as ReviewStatus
        } else {
          errors.push(
            `[${where}] review_status "${raw.review_status}" cannot be set from a file. ` +
            `Use ${AUTHORABLE_STATUSES.map((s) => `"${s}"`).join(' or ')}, or leave it out. ` +
            `Approval only ever happens in /admin/articles.`,
          )
        }
      }

      if (!raw.slug) continue

      const prior = seenSlugs.get(raw.slug)
      if (prior) {
        errors.push(`[${where}] Duplicate slug "${raw.slug}" — also in ${prior}`)
      }
      seenSlugs.set(raw.slug, where)

      articles.push({
        slug: raw.slug,
        title: raw.title ?? '',
        category: raw.category ?? '',
        body_md: raw.body_md ?? '',
        tags: raw.tags ?? [],
        estimated_read_minutes: raw.estimated_read_minutes ?? null,
        review_status: reviewStatus,
        ...(raw.published_at !== undefined
          ? { published_at: raw.published_at ? new Date(raw.published_at).toISOString() : null }
          : {}),
        tier,
      })
    }
  }

  return { articles, errors }
}

interface ExistingArticle {
  slug: string
  title: string
  body_md: string
  review_status: ReviewStatus
}

async function main() {
  console.log('📚 Importing Learn articles...')

  const { articles, errors } = loadArticles()

  if (errors.length > 0) {
    console.error('\n❌ Validation failed:\n')
    errors.forEach((e) => console.error(`   • ${e}`))
    console.error('\nFix these before importing.\n')
    process.exit(1)
  }

  console.log(`   Found ${articles.length} article(s)`)

  if (articles.length === 0) {
    console.log('\n   Nothing to import. Add YAML files to content/modules/{free,premium}/\n')
    return
  }

  if (isDryRun) {
    for (const a of articles) console.log(`   • [${a.tier}] ${a.slug}`)
    console.log('\n✅ Dry run — validation passed. No changes written.\n')
    return
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error(
      '\n❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.' +
      '\n   Set them in .env.local, or run with --dry-run to validate only.\n'
    )
    process.exit(1)
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: existingRows, error: readError } = await supabase
    .from('content_modules')
    .select('slug, title, body_md, review_status')
    .in('slug', articles.map((a) => a.slug))

  if (readError) {
    console.error(`\n❌ Could not read existing articles: ${readError.message}\n`)
    process.exit(1)
  }

  const existing = new Map<string, ExistingArticle>(
    (existingRows ?? []).map((r) => [r.slug, r as ExistingArticle]),
  )

  // One statement per article. The set of columns differs between a new
  // article and an edit to an existing one, and PostgREST requires every row
  // in a bulk write to carry identical keys — but mostly it keeps each
  // article's outcome reportable on its own line, which is the thing an
  // operator needs when an import withdraws somebody's approval.
  let created = 0
  let updated = 0
  const revoked: string[] = []

  for (const article of articles) {
    const { review_status, ...content } = article
    const prior = existing.get(article.slug)

    if (!prior) {
      const { error } = await supabase
        .from('content_modules')
        .insert({ ...content, review_status })
      if (error) {
        console.error(`\n❌ ${article.slug}: ${error.message}\n`)
        process.exit(1)
      }
      created++
      console.log(`   + [${article.tier}] ${article.slug} — new, ${review_status === 'draft' ? 'saved as a draft' : 'waiting for review'}`)
      continue
    }

    // Note the omission of review_status: an edit never asserts a state. If
    // this changes the wording of an approved article, the database trigger
    // withdraws the approval by itself — this only predicts it, so the
    // operator is not surprised by an article dropping out of the app.
    const willRevoke =
      prior.review_status === 'approved' && editRevokesApproval(prior, article)

    const { error } = await supabase
      .from('content_modules')
      .update(content)
      .eq('slug', article.slug)

    if (error) {
      console.error(`\n❌ ${article.slug}: ${error.message}\n`)
      process.exit(1)
    }
    updated++

    if (willRevoke) {
      revoked.push(article.slug)
      console.log(`   ! [${article.tier}] ${article.slug} — wording changed; approval withdrawn`)
    } else {
      console.log(`   ~ [${article.tier}] ${article.slug} — updated (${prior.review_status})`)
    }
  }

  console.log(`\n✅ ${created} added, ${updated} updated.`)

  if (revoked.length > 0) {
    console.log(
      `\n⚠️  ${revoked.length} article(s) were approved and have now changed:\n` +
      revoked.map((s) => `      • ${s}`).join('\n') +
      `\n   They are no longer visible in the app, and are back in the queue at` +
      `\n   /admin/articles to be read again. Tell the reviewer.`,
    )
  }
  console.log()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
