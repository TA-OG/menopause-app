import { createAdminClient } from '@/lib/supabase/admin'
import { sortForReview, type ReviewStatus } from '@/lib/article-review'
import ArticleReview, { type ReviewArticle, type ReviewHistoryEntry } from './ArticleReview'

export const dynamic = 'force-dynamic'

/**
 * Article review — Pamela's sign-off screen.
 *
 * Reads through the service-role client on purpose: an article that has not
 * been approved is invisible to every other client by RLS (035), including the
 * reviewer's own session. This page is the one place unapproved article text
 * is shown, and only behind the is_admin gate in the /admin layout.
 */
export default async function ArticleReviewPage() {
  const admin = createAdminClient()

  const { data: rows, error } = await admin
    .from('content_modules')
    // One literal string: supabase-js infers the row type from the select, and
    // a concatenated expression widens to `string` and loses it.
    .select('id, slug, title, body_md, tier, category, tags, estimated_read_minutes, published_at, review_status, reviewed_at, review_note, updated_at')

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
        Failed to load articles: {error.message}
        <p className="mt-2 text-xs text-red-500">
          If this is the first run, the review columns may not exist yet —
          apply migration 035_content_review.sql.
        </p>
      </div>
    )
  }

  const articles = sortForReview((rows ?? []) as ReviewArticle[])

  // Sign-off history, newest first, grouped per article. Shown so a reviewer
  // can see what she asked for last time before deciding again.
  const { data: events } = await admin
    .from('content_review_events')
    .select('id, module_id, from_status, to_status, note, actor_email, created_at')
    .order('created_at', { ascending: false })
    .limit(500)

  const history: Record<string, ReviewHistoryEntry[]> = {}
  for (const event of events ?? []) {
    const list = history[event.module_id] ?? (history[event.module_id] = [])
    if (list.length < 10) list.push(event as ReviewHistoryEntry)
  }

  const count = (status: ReviewStatus) =>
    articles.filter((a) => a.review_status === status).length

  return (
    <ArticleReview
      articles={articles}
      history={history}
      counts={{
        waiting: count('in_review'),
        sentBack: count('changes_requested'),
        approved: count('approved'),
        drafts: count('draft'),
      }}
    />
  )
}
