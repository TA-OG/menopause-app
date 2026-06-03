/**
 * Import Learn articles from YAML into the content_modules table.
 *
 * Reads:
 *   content/modules/free/*.yaml      → tier = free
 *   content/modules/premium/*.yaml   → tier = premium
 *
 * Upserts each article by `slug` (unique). Tier is taken from the folder,
 * never from the file. Run after Pamela's articles change:
 *
 *   npm run import-content            # publish to the database
 *   npm run import-content -- --dry-run   # validate only, no DB writes
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
        published_at: raw.published_at ? new Date(raw.published_at).toISOString() : null,
        tier,
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
    console.log(`   • [${a.tier}] ${a.slug} (${state})`)
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

  const { error } = await supabase
    .from('content_modules')
    .upsert(articles, { onConflict: 'slug' })

  if (error) {
    console.error(`\n❌ Database error: ${error.message}\n`)
    process.exit(1)
  }

  console.log(`\n✅ Imported ${articles.length} article(s).\n`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
