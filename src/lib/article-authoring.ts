/**
 * Learn article authoring — the rules, as pure functions.
 *
 * Articles live in `content_modules` and are written by Pamela in
 * /admin/articles. She is the author and the clinical authority, so there is
 * no separate approver: saving keeps an article to herself, publishing puts it
 * in front of readers, and unpublishing takes it straight back down.
 *
 * Everything here is pure and has no I/O, so the API route and the editor UI
 * enforce identical rules and both are testable without a database. The
 * database remains the boundary that actually matters — see
 * 026_content_modules_premium_rls.sql for the read gate and
 * 035_article_authoring.sql for authorship and history.
 */

import { z } from 'zod'
import type { ContentTier } from '@/types/database'

// ─── Publication state ────────────────────────────────────────────────────

/**
 * What a reader would see right now.
 *
 * `scheduled` exists because published_at is a timestamp, not a flag: a date
 * in the future means the article is written and finished but not yet visible.
 * The RLS policy already treats it that way (`published_at <= NOW()`), so the
 * editor has to say so too rather than showing it as live.
 */
export type PublicationState = 'draft' | 'scheduled' | 'live'

export function publicationState(
  publishedAt: string | null,
  now: Date = new Date(),
): PublicationState {
  if (!publishedAt) return 'draft'
  return new Date(publishedAt) <= now ? 'live' : 'scheduled'
}

export const PUBLICATION_STATE_LABELS: Record<PublicationState, string> = {
  draft: 'Draft — only you can see this',
  scheduled: 'Scheduled — goes live automatically',
  live: 'Live — women using the app can read this now',
}

// ─── Slugs ────────────────────────────────────────────────────────────────

/** Matches the slug format used in /learn/[slug] URLs. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Derive a URL slug from a title.
 *
 * Accents are stripped rather than dropped, so "Ménopause" becomes
 * "menopause" instead of "mnopause" — the content is UK English but titles
 * quote French, Spanish and Portuguese sources often enough to matter.
 */
export function slugify(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // strip combining accents
    .toLowerCase()
    .replace(/['’]/g, '')             // don't turn "women's" into "women-s"
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '')              // slice may have left a trailing dash
}

/**
 * Add a numeric suffix until the slug is free.
 *
 * The database has a UNIQUE constraint on slug and is the real arbiter — this
 * only spares the author an avoidable error on the obvious case of two
 * articles sharing a title.
 */
export function uniqueSlug(desired: string, taken: readonly string[]): string {
  const base = desired || 'article'
  if (!taken.includes(base)) return base

  for (let n = 2; n < 1000; n++) {
    const candidate = `${base}-${n}`
    if (!taken.includes(candidate)) return candidate
  }
  // 998 articles sharing one title is not a real scenario, but returning
  // something unique-ish beats throwing in an editor the author is mid-save in.
  return `${base}-${Date.now()}`
}

// ─── Reading time ─────────────────────────────────────────────────────────

/** Average adult reading speed for non-technical prose, words per minute. */
const WORDS_PER_MINUTE = 200

/**
 * Estimate reading time from the Markdown body.
 *
 * Markdown syntax is stripped first so a heading-heavy article isn't inflated
 * by its own `#` characters. Always at least 1 — "0 min read" reads as broken.
 */
export function estimateReadMinutes(bodyMd: string): number {
  const words = bodyMd
    .replace(/```[\s\S]*?```/g, ' ')      // fenced code
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')  // links/images → their text
    .replace(/[#>*_~`|-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length

  return Math.max(1, Math.round(words / WORDS_PER_MINUTE))
}

// ─── Validation ───────────────────────────────────────────────────────────

export const MAX_TITLE_LENGTH = 200
export const MAX_CATEGORY_LENGTH = 60
export const MAX_TAGS = 10
export const MAX_TAG_LENGTH = 40
/**
 * ~200k characters is far beyond any Learn article (the longest plausible one
 * is a few thousand words) while still refusing a paste that would bloat every
 * reader's page load.
 */
export const MAX_BODY_LENGTH = 200_000

const titleSchema = z
  .string()
  .trim()
  .min(1, 'Give the article a title.')
  .max(MAX_TITLE_LENGTH, `Titles must be ${MAX_TITLE_LENGTH} characters or fewer.`)

const slugSchema = z
  .string()
  .trim()
  .min(1, 'The web address cannot be empty.')
  .max(100, 'The web address is too long.')
  .regex(
    SLUG_PATTERN,
    'The web address can only use lowercase letters, numbers and hyphens.',
  )

const bodySchema = z
  .string()
  .max(MAX_BODY_LENGTH, 'This article is too long to save.')

const categorySchema = z
  .string()
  .trim()
  .min(1, 'Choose a category so the article can be filed.')
  .max(MAX_CATEGORY_LENGTH, `Categories must be ${MAX_CATEGORY_LENGTH} characters or fewer.`)

const tagsSchema = z
  .array(z.string().trim().min(1).max(MAX_TAG_LENGTH))
  .max(MAX_TAGS, `An article can have at most ${MAX_TAGS} tags.`)

const tierSchema = z.enum(['free', 'premium'])

/**
 * `published_at` is accepted as an ISO string or null, never as a boolean.
 * Publishing is a date, so scheduling is the same operation as publishing and
 * needs no separate code path.
 */
const publishedAtSchema = z
  .string()
  .datetime({ message: 'Publication date is not a valid date.' })
  .nullable()

export const createArticleSchema = z.object({
  title: titleSchema,
  slug: slugSchema.optional(),  // derived from the title when absent
  body_md: bodySchema.default(''),
  tier: tierSchema.default('free'),
  category: categorySchema,
  tags: tagsSchema.default([]),
  estimated_read_minutes: z.number().int().min(1).max(600).nullable().optional(),
  published_at: publishedAtSchema.optional(),
})

/**
 * Every field optional: the editor sends only what changed, so an untouched
 * field can never be blanked by omission.
 */
export const updateArticleSchema = z.object({
  title: titleSchema.optional(),
  slug: slugSchema.optional(),
  body_md: bodySchema.optional(),
  tier: tierSchema.optional(),
  category: categorySchema.optional(),
  tags: tagsSchema.optional(),
  estimated_read_minutes: z.number().int().min(1).max(600).nullable().optional(),
})

export const publishSchema = z.object({
  action: z.enum(['publish', 'unpublish']),
  /** ISO timestamp. Future-dated schedules the article. Defaults to now. */
  publish_at: z.string().datetime().nullable().optional(),
})

export type CreateArticleInput = z.infer<typeof createArticleSchema>
export type UpdateArticleInput = z.infer<typeof updateArticleSchema>
export type PublishInput = z.infer<typeof publishSchema>

// ─── Publishing rules ─────────────────────────────────────────────────────

/**
 * Minimum words before an article may go live.
 *
 * A near-empty article reaching a woman looking for help on hot flushes is a
 * worse failure than a blocked publish, and an accidental "Publish" on a blank
 * draft is an easy mistake to make.
 */
export const MIN_PUBLISH_WORDS = 50

export interface PublishReadiness {
  ready: boolean
  /** Everything blocking publication, so the author fixes them in one pass. */
  problems: string[]
}

export function checkPublishReadiness(article: {
  title: string
  body_md: string
  category: string
}): PublishReadiness {
  const problems: string[] = []

  if (!article.title.trim()) problems.push('It needs a title.')
  if (!article.category.trim()) problems.push('It needs a category.')

  const words = article.body_md.trim().split(/\s+/).filter(Boolean).length
  if (words < MIN_PUBLISH_WORDS) {
    problems.push(
      `It needs at least ${MIN_PUBLISH_WORDS} words before it can go live ` +
      `(currently ${words}).`,
    )
  }

  return { ready: problems.length === 0, problems }
}

/**
 * Whether changing a slug would break links readers may already hold.
 *
 * Only true for an article that has actually been live: nobody can have
 * bookmarked a draft, so renaming one costs nothing.
 */
export function slugChangeBreaksLinks(
  current: { slug: string; published_at: string | null },
  nextSlug: string,
  now: Date = new Date(),
): boolean {
  if (current.slug === nextSlug) return false
  return publicationState(current.published_at, now) === 'live'
}

/** Categories offered in the editor. Free text is still allowed. */
export const SUGGESTED_CATEGORIES: readonly string[] = [
  'Symptoms',
  'Nutrition',
  'Sleep',
  'Movement',
  'Mind & mood',
  'HRT & medical',
  'Relationships',
  'Work',
] as const

export type { ContentTier }
