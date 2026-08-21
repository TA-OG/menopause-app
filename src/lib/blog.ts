/**
 * SEO blog loader.
 *
 * This is the PUBLIC, unauthenticated marketing blog at /blog. It is deliberately
 * separate from `/learn` (Pamela's in-app library, stored in Supabase
 * `content_modules` and gated by tier). Nothing here is personalised, nothing here
 * is gated, and nothing here is a wellness recommendation — /learn remains the
 * information source for members.
 *
 * Posts are markdown files in content/blog/ with YAML frontmatter. They are read
 * at build time (the routes are statically generated), so there is no runtime I/O
 * on the request path.
 */

import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'

export const BLOG_DIR = path.join(process.cwd(), 'content/blog')

/** A citation backing a factual claim in a post. Every post needs at least one. */
export interface BlogSource {
  /** Title of the cited item, as published. */
  title: string
  /** Who published it — the organisation carrying the authority. */
  publisher: string
  /** Direct URL to the source. */
  url: string
  /** When we last checked the URL said what we say it says (YYYY-MM). */
  accessed: string
}

/** A question/answer pair, surfaced as FAQPage structured data. */
export interface BlogFaq {
  question: string
  answer: string
}

export interface BlogPostMeta {
  slug: string
  title: string
  /** Meta description. Kept under 160 characters so search engines don't truncate it. */
  description: string
  /** ISO date (YYYY-MM-DD). */
  publishedAt: string
  /** ISO date (YYYY-MM-DD). Absent until the post is revised. */
  updatedAt?: string
  author: string
  category: string
  readMinutes: number
  keywords: string[]
  sources: BlogSource[]
  faqs: BlogFaq[]
}

export interface BlogPost extends BlogPostMeta {
  /** Markdown body, frontmatter stripped. */
  body: string
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

/**
 * Split a raw markdown file into its frontmatter block and body.
 * Returns null when the file has no frontmatter — the caller decides whether
 * that is an error (validation) or a file to skip (loading).
 */
export function splitFrontmatter(
  raw: string
): { frontmatter: unknown; body: string } | null {
  const match = FRONTMATTER_RE.exec(raw)
  if (!match) return null
  return {
    frontmatter: yaml.load(match[1]) ?? {},
    body: match[2].trim(),
  }
}

function isSource(value: unknown): value is BlogSource {
  if (!value || typeof value !== 'object') return false
  const s = value as Record<string, unknown>
  return (
    typeof s.title === 'string' &&
    typeof s.publisher === 'string' &&
    typeof s.url === 'string' &&
    typeof s.accessed === 'string'
  )
}

function isFaq(value: unknown): value is BlogFaq {
  if (!value || typeof value !== 'object') return false
  const f = value as Record<string, unknown>
  return typeof f.question === 'string' && typeof f.answer === 'string'
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string')
}

/**
 * Validate one post's frontmatter. Returns the problems found, so the build-time
 * validator can report every defect in one pass rather than throwing on the first.
 *
 * Fails closed: anything not positively verified as the right shape is an error.
 * A post that ships an unsourced factual claim about a named person or a health
 * intervention is exactly the failure mode this repo exists to prevent.
 */
export function validatePostFrontmatter(
  fileName: string,
  frontmatter: unknown
): string[] {
  const errors: string[] = []
  const fail = (msg: string) => errors.push(`${fileName}: ${msg}`)

  if (!frontmatter || typeof frontmatter !== 'object' || Array.isArray(frontmatter)) {
    return [`${fileName}: frontmatter is missing or is not a YAML mapping`]
  }
  const fm = frontmatter as Record<string, unknown>

  const expectedSlug = fileName.replace(/\.md$/, '')
  if (typeof fm.slug !== 'string' || fm.slug.length === 0) {
    fail('slug is required')
  } else if (fm.slug !== expectedSlug) {
    // The slug is the canonical URL. Letting it drift from the filename means the
    // sitemap and the route can disagree about where a post lives.
    fail(`slug "${fm.slug}" does not match filename (expected "${expectedSlug}")`)
  }

  for (const field of ['title', 'description', 'publishedAt', 'author', 'category'] as const) {
    if (typeof fm[field] !== 'string' || (fm[field] as string).trim().length === 0) {
      fail(`${field} is required and must be a non-empty string`)
    }
  }

  if (typeof fm.description === 'string' && fm.description.length > 160) {
    fail(`description is ${fm.description.length} chars — keep it to 160 so search engines don't truncate it`)
  }

  for (const field of ['publishedAt', 'updatedAt'] as const) {
    const value = fm[field]
    if (value === undefined) continue
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      fail(`${field} must be an ISO date (YYYY-MM-DD)`)
    }
  }

  if (typeof fm.readMinutes !== 'number' || !Number.isFinite(fm.readMinutes) || fm.readMinutes <= 0) {
    fail('readMinutes is required and must be a positive number')
  }

  if (!isStringArray(fm.keywords) || fm.keywords.length === 0) {
    fail('keywords is required and must be a non-empty list of strings')
  }

  if (!Array.isArray(fm.sources) || fm.sources.length === 0) {
    fail('sources is required and must list at least one citation')
  } else if (!fm.sources.every(isSource)) {
    fail('every source needs a title, publisher, url and accessed date')
  } else {
    fm.sources.forEach((s, i) => {
      if (!/^https:\/\//.test(s.url)) {
        fail(`sources[${i}] url must be an https URL so the claim can actually be checked`)
      }
      if (!/^\d{4}-\d{2}$/.test(s.accessed)) {
        fail(`sources[${i}] accessed must be YYYY-MM`)
      }
    })
  }

  if (fm.faqs !== undefined && (!Array.isArray(fm.faqs) || !fm.faqs.every(isFaq))) {
    fail('faqs, when present, must be a list of { question, answer }')
  }

  return errors
}

function toPost(fileName: string, frontmatter: unknown, body: string): BlogPost {
  const fm = frontmatter as Record<string, unknown>
  return {
    slug: fm.slug as string,
    title: fm.title as string,
    description: fm.description as string,
    publishedAt: fm.publishedAt as string,
    updatedAt: typeof fm.updatedAt === 'string' ? fm.updatedAt : undefined,
    author: fm.author as string,
    category: fm.category as string,
    readMinutes: fm.readMinutes as number,
    keywords: fm.keywords as string[],
    sources: fm.sources as BlogSource[],
    faqs: Array.isArray(fm.faqs) ? (fm.faqs as BlogFaq[]) : [],
    body,
  }
}

/**
 * Parse every post in a directory.
 *
 * Throws on an invalid post rather than skipping it. A silently dropped post is
 * a page that 404s in production with a green build, which is worse than a red one.
 */
export function loadPostsFrom(dir: string): BlogPost[] {
  let files: string[]
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'))
  } catch {
    // No blog directory yet — an empty index is the correct rendering.
    return []
  }

  const posts: BlogPost[] = []
  const errors: string[] = []

  for (const file of files.sort()) {
    const raw = fs.readFileSync(path.join(dir, file), 'utf8')
    const split = splitFrontmatter(raw)
    if (!split) {
      errors.push(`${file}: no YAML frontmatter block found`)
      continue
    }
    const fieldErrors = validatePostFrontmatter(file, split.frontmatter)
    if (fieldErrors.length > 0) {
      errors.push(...fieldErrors)
      continue
    }
    if (split.body.length === 0) {
      errors.push(`${file}: body is empty`)
      continue
    }
    posts.push(toPost(file, split.frontmatter, split.body))
  }

  const seen = new Set<string>()
  for (const post of posts) {
    if (seen.has(post.slug)) errors.push(`duplicate slug "${post.slug}"`)
    seen.add(post.slug)
  }

  if (errors.length > 0) {
    throw new Error(`Invalid blog content:\n  • ${errors.join('\n  • ')}`)
  }

  // Newest first.
  return posts.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
}

export function getAllPosts(): BlogPost[] {
  return loadPostsFrom(BLOG_DIR)
}

export function getPostBySlug(slug: string): BlogPost | undefined {
  return getAllPosts().find((p) => p.slug === slug)
}
