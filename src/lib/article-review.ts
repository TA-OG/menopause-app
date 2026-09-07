/**
 * Article review & approval — the rules, as pure functions.
 *
 * Articles are written as YAML (content/modules/{free,premium}/*.yaml) and
 * loaded into content_modules by `npm run import-content`. Before this module
 * existed, that import was the whole publishing process: the file said
 * `published_at`, the script pushed it, and a woman read it. Nobody had to
 * have read it first.
 *
 * Review sits between those two steps. An article is only readable once a
 * named admin has read it and approved that exact wording, and the approval
 * is withdrawn the moment the wording changes.
 *
 * The database is what actually enforces all of this — see
 * 035_content_review.sql for the RLS policy and the revoke-on-edit trigger.
 * What lives here is the same logic in TypeScript, so the API route can reject
 * a bad transition with a useful message instead of a constraint violation,
 * so the admin UI can describe the state in plain English, and so both are
 * testable without a database.
 */

import type { ContentReviewStatus } from '@/types/database'

// ─── State ────────────────────────────────────────────────────────────────

/**
 * Re-exported so callers can work in review terms without reaching past this
 * module. The union itself lives in types/database.ts alongside the row it
 * belongs to, and mirrors the `content_review_status` enum in the database.
 */
export type ReviewStatus = ContentReviewStatus

/**
 * How each state is described to the reviewer. Deliberately plain: the person
 * reading these is a menopause specialist, not an editor, and "in_review" or
 * "changes_requested" on a screen tells her nothing about what to do next.
 *
 * Being a Record over the full union, TypeScript will not let a new state be
 * added to the enum without a label being written for it here.
 */
export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  draft:             'Still being written',
  in_review:         'Waiting for you',
  changes_requested: 'Sent back',
  approved:          'Approved by you',
}

export const REVIEW_STATUS_DESCRIPTIONS: Record<ReviewStatus, string> = {
  draft:
    'The team is still working on this one. It will appear here for you when it is ready.',
  in_review:
    'Nobody has read this yet except the person who wrote it. It is not visible to anyone using the app.',
  changes_requested:
    'You sent this back. It stays hidden from women using the app until it is rewritten and you approve it.',
  approved:
    'You approved this wording. If anyone changes the title or the words afterwards, it comes straight back to you and hides itself again until you have read it.',
}

/**
 * Every review state. Derived from the label record rather than written out
 * again, so it can never fall out of step with the union.
 */
export const REVIEW_STATUSES = Object.keys(REVIEW_STATUS_LABELS) as ReviewStatus[]

export function isReviewStatus(value: unknown): value is ReviewStatus {
  return typeof value === 'string' && (REVIEW_STATUSES as string[]).includes(value)
}

// ─── Actions ──────────────────────────────────────────────────────────────

export const REVIEW_ACTIONS = ['approve', 'request_changes'] as const
export type ReviewAction = (typeof REVIEW_ACTIONS)[number]

export function isReviewAction(value: unknown): value is ReviewAction {
  return typeof value === 'string' && (REVIEW_ACTIONS as readonly string[]).includes(value)
}

/**
 * Which states each action may be taken from.
 *
 * `approve` is not available from 'draft': an article the team has not
 * finished writing should not be signed off, even by someone willing to.
 *
 * `request_changes` IS available from 'approved', because a reviewer must be
 * able to pull something back after the fact — noticing a wrong dose the day
 * after approving it is exactly when the button needs to work.
 */
const ALLOWED_FROM: Record<ReviewAction, readonly ReviewStatus[]> = {
  approve:         ['in_review', 'changes_requested'],
  request_changes: ['in_review', 'changes_requested', 'approved'],
}

const RESULT_OF: Record<ReviewAction, ReviewStatus> = {
  approve:         'approved',
  request_changes: 'changes_requested',
}

export interface TransitionInput {
  from: ReviewStatus
  action: ReviewAction
  /** The reviewer's note. Required when sending an article back. */
  note?: string | null
}

export type TransitionResult =
  | { ok: true; to: ReviewStatus; note: string | null }
  | { ok: false; error: string }

/**
 * Validate a review decision and resolve the state it lands in.
 *
 * A note is mandatory for `request_changes` and optional for `approve`. That
 * asymmetry is the point: sending an article back without saying what is wrong
 * with it leaves the author guessing, and guessing at health copy is how wrong
 * copy gets written twice.
 */
export function resolveTransition({ from, action, note }: TransitionInput): TransitionResult {
  if (!ALLOWED_FROM[action].includes(from)) {
    return {
      ok: false,
      error:
        action === 'approve'
          ? `This article cannot be approved while it is "${REVIEW_STATUS_LABELS[from]}".`
          : `This article cannot be sent back while it is "${REVIEW_STATUS_LABELS[from]}".`,
    }
  }

  const trimmed = (note ?? '').trim()

  if (action === 'request_changes' && trimmed === '') {
    return {
      ok: false,
      error: 'Please say what needs changing before sending this back.',
    }
  }

  return { ok: true, to: RESULT_OF[action], note: trimmed === '' ? null : trimmed }
}

// ─── Visibility ───────────────────────────────────────────────────────────

/** The fields that decide whether a user can read an article. */
export interface VisibilityInput {
  review_status: ReviewStatus
  published_at: string | null
}

/**
 * Whether an article is readable by users right now.
 *
 * This mirrors the RLS policy in 035_content_review.sql, minus the tier check
 * (which is about who pays, not about whether the article has been checked).
 * It exists so the review screen can tell the reviewer the truth about what is
 * live — it is NOT the enforcement point, and nothing should rely on it as one.
 */
export function isLive(article: VisibilityInput, now: Date = new Date()): boolean {
  if (article.review_status !== 'approved') return false
  if (!article.published_at) return false

  const published = new Date(article.published_at)
  if (Number.isNaN(published.getTime())) return false

  return published.getTime() <= now.getTime()
}

/**
 * The publish date an article should carry once approved.
 *
 * Approving is what puts an article in front of women, so an article that has
 * never been published gets its date from the approval. One that already has a
 * date keeps it: that date is when it first went out, and re-approving after an
 * edit should not rewrite that history.
 */
export function publishedAtAfterApproval(
  current: string | null,
  now: Date = new Date(),
): string {
  return current ?? now.toISOString()
}

// ─── Approval durability ──────────────────────────────────────────────────

/** The parts of an article a reviewer actually reads and signs off. */
export interface ReviewedContent {
  title: string
  body_md: string
}

export function reviewedContentOf(article: ReviewedContent): ReviewedContent {
  return { title: article.title, body_md: article.body_md }
}

/**
 * Whether an edit revokes an existing approval.
 *
 * The TypeScript twin of the `content_modules_revoke_approval` trigger. The
 * trigger is the real guarantee — it fires on every write path including the
 * import script and raw SQL. This is here so the behaviour is documented,
 * testable, and can be explained in the UI before it happens.
 *
 * Only title and body_md count. Refiling an article under another category, or
 * correcting its read time, does not change a single word a woman reads.
 */
export function editRevokesApproval(before: ReviewedContent, after: ReviewedContent): boolean {
  return before.title !== after.title || before.body_md !== after.body_md
}

// ─── Queue ordering ───────────────────────────────────────────────────────

/** Articles the reviewer still has to do something about, first. */
const QUEUE_RANK: Record<ReviewStatus, number> = {
  in_review:         0,
  changes_requested: 1,
  approved:          2,
  draft:             3,
}

export interface ReviewableArticle extends VisibilityInput {
  title: string
  updated_at: string
}

/**
 * Sort for the review screen: what needs her attention at the top, and within
 * each group the ones that have been waiting longest.
 */
export function sortForReview<T extends ReviewableArticle>(articles: readonly T[]): T[] {
  return [...articles].sort((a, b) => {
    const rank = QUEUE_RANK[a.review_status] - QUEUE_RANK[b.review_status]
    if (rank !== 0) return rank

    const aTime = new Date(a.updated_at).getTime()
    const bTime = new Date(b.updated_at).getTime()
    const aValid = !Number.isNaN(aTime)
    const bValid = !Number.isNaN(bTime)

    // Rows with an unreadable timestamp sort last rather than scrambling the
    // order around them, then fall back to title so the list stays stable.
    if (aValid && bValid && aTime !== bTime) return aTime - bTime
    if (aValid !== bValid) return aValid ? -1 : 1

    return a.title.localeCompare(b.title)
  })
}
