/**
 * Import Learn articles from YAML into the content_modules table.
 *
 * Reads:
 *   content/modules/free/*.yaml      → tier = free
 *   content/modules/premium/*.yaml   → tier = premium
 *
 * A translation sits alongside its English source with a locale suffix:
 *   when-progesterone-is-the-missing-piece.yaml      → locale = en
 *   when-progesterone-is-the-missing-piece.fr.yaml    → locale = fr
 * Both share the same `slug`; an article is identified by (slug, locale), so
 * a translation is its own row and never touches the English one.
 * Tier is taken from the folder, never from the file.
 *
 *   npm run import-content                # seed new articles into the database
 *   npm run import-content -- --dry-run   # validate only, no DB writes
 *
 * ─── This script is a seeding tool, not the source of truth ────────────────
 *
 * Since 035_article_authoring.sql, Pamela writes and edits articles in
 * /admin/articles and the database holds the live copy. A YAML file can no
 * longer speak for an article she has touched, so this import:
 *
 *   • inserts articles whose slug does not exist yet;
 *   • updates an article ONLY while it is untouched in the app — that is,
 *     while both created_by and updated_by are still NULL;
 *   • never changes published_at on an existing article. Publishing and
 *     unpublishing happen in /admin/articles, where the decision is recorded
 *     against a named person in content_module_revisions.
 *
 * It previously ran a blind `upsert` on slug, which would silently overwrite
 * her wording — including the wording of a live article — with whatever a file
 * happened to say. Anything it now declines to touch is reported rather than
 * skipped quietly.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 * (loaded from .env.local or .env).
 */

import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

const MODULES_DIR = path.join(process.cwd(), 'content/modules')
const TIERS = ['free', 'premium'] as const
type Tier = (typeof TIERS)[number]

// Keep in sync with SUPPORTED_LOCALES in src/lib/locale-geo-map.ts (not
// imported directly — scripts run via tsx outside the app's path aliases,
// and this list changes rarely enough that duplicating it here is simpler
// than wiring up module resolution just for this one script).
const LOCALE_SUFFIXES = ['fr', 'es', 'de', 'pt'] as const
type Locale = 'en' | (typeof LOCALE_SUFFIXES)[number]

/**
 * Translations of an article live alongside the English source with a
 * locale suffix: `slug.yaml` (English, implicit) next to `slug.fr.yaml`.
 * Both share the same `slug` — that's what makes them translations of the
 * same article rather than separate articles.
 */
function parseFilename(file: string): { base: string; locale: Locale } {
  const suffixed = file.match(/^(.+)\.(fr|es|de|pt)\.yaml$/)
  if (suffixed) return { base: suffixed[1], locale: suffixed[2] as Locale }
  return { base: file.replace(/\.yaml$/, ''), locale: 'en' }
}

interface ArticleFile {
  slug?: string
  title?: string
  category?: string
  body_md?: string
  tags?: string[]
  estimated_read_minutes?: number
  published_at?: string | null
  tier?: string
}

interface ParsedArticle {
  slug: string
  title: string
  category: string
  body_md: string
  tags: string[]
  estimated_read_minutes: number | null
  published_at: string | null
  tier: Tier
  locale: Locale
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
      const { locale } = parseFilename(file)
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
      if (!raw.slug) continue

      // Translations of the same article share a slug — only flag a
      // duplicate when the same slug+locale pair repeats.
      const dedupeKey = `${raw.slug}:${locale}`
      const prior = seenSlugs.get(dedupeKey)
      if (prior) {
        errors.push(`[${where}] Duplicate slug "${raw.slug}" for locale "${locale}" — also in ${prior}`)
      }
      seenSlugs.set(dedupeKey, where)

      articles.push({
        slug: raw.slug,
        title: raw.title ?? '',
        category: raw.category ?? '',
        body_md: raw.body_md ?? '',
        tags: raw.tags ?? [],
        estimated_read_minutes: raw.estimated_read_minutes ?? null,
        published_at: raw.published_at ? new Date(raw.published_at).toISOString() : null,
        tier,
        locale,
      })
    }
  }

  return { articles, errors }
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
  for (const a of articles) {
    const state = a.published_at ? 'published' : 'draft'
    console.log(`   • [${a.tier}/${a.locale}] ${a.slug} (${state})`)
  }

  if (articles.length === 0) {
    console.log('\n   Nothing to import. Add YAML files to content/modules/{free,premium}/\n')
    return
  }

  if (isDryRun) {
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

  // Look up what already exists, and who has touched it. An article with a
  // created_by or updated_by has been through /admin/articles, so the app —
  // not this file — holds its current wording.
  const { data: existingRows, error: readError } = await supabase
    .from('content_modules')
    .select('slug, locale, created_by, updated_by')
    .in('slug', Array.from(new Set(articles.map((a) => a.slug))))

  if (readError) {
    console.error(`\n❌ Could not read existing articles: ${readError.message}\n`)
    process.exit(1)
  }

  // Keyed by slug AND locale: a French translation Pamela has edited must not
  // shield (or expose) the English article that shares its slug.
  const keyOf = (slug: string, locale: string) => `${slug}:${locale}`
  const existing = new Map(
    (existingRows ?? []).map((row) => [
      keyOf(row.slug as string, row.locale as string),
      { authored: row.created_by !== null || row.updated_by !== null },
    ]),
  )

  let created = 0
  let updated = 0
  const skipped: string[] = []

  // One statement per article: the columns differ between an insert and an
  // update (published_at is set on the first and never on the second), and it
  // keeps each article's outcome reportable on its own line.
  for (const article of articles) {
    const label = article.locale === 'en' ? article.slug : `${article.slug} (${article.locale})`
    const current = existing.get(keyOf(article.slug, article.locale))

    if (!current) {
      const { error } = await supabase.from('content_modules').insert(article)
      if (error) {
        console.error(`\n❌ Could not create ${label}: ${error.message}\n`)
        process.exit(1)
      }
      created++
      continue
    }

    if (current.authored) {
      skipped.push(label)
      continue
    }

    // Untouched in the app: safe to refresh from the file. published_at is
    // deliberately not in this update — an article's visibility is only ever
    // changed from /admin/articles.
    const { error } = await supabase
      .from('content_modules')
      .update({
        title: article.title,
        category: article.category,
        body_md: article.body_md,
        tags: article.tags,
        estimated_read_minutes: article.estimated_read_minutes,
        tier: article.tier,
      })
      .eq('slug', article.slug)
      .eq('locale', article.locale)

    if (error) {
      console.error(`\n❌ Could not update ${label}: ${error.message}\n`)
      process.exit(1)
    }
    updated++
  }

  console.log(`\n✅ Created ${created}, updated ${updated}.`)

  if (skipped.length > 0) {
    console.log(
      `\n⚠️  Left alone (${skipped.length}) — these have been edited in /admin/articles,\n` +
      '   so the app holds the current wording and this file no longer speaks for them:\n' +
      skipped.map((s) => `   • ${s}`).join('\n') +
      '\n\n   To change one of these, edit it in /admin/articles.\n',
    )
  } else {
    console.log('')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
