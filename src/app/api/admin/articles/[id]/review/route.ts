import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin-auth'
import { rateLimit } from '@/lib/rate-limit'
import { sanitizeError } from '@/lib/sanitize-error'
import {
  isReviewAction,
  resolveTransition,
  publishedAtAfterApproval,
  reviewedContentOf,
  type ReviewStatus,
} from '@/lib/article-review'

/**
 * POST /api/admin/articles/[id]/review
 * Body: { action: 'approve' | 'request_changes', note?: string }
 *
 * Records one review decision on an article and moves it to the resulting
 * state. This is the only way `review_status` ever becomes 'approved' — the
 * YAML import pipeline has no path to it — so it is also the only place a
 * woman using the app can be shown a new article.
 *
 * Approving sets `published_at` if the article has never been published, so
 * the reviewer has one decision to make rather than two. An article that has
 * been out before keeps its original date.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const { success } = await rateLimit(request, { limit: 30, windowMs: 60_000 })
  if (!success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  const supabase = createClient()
  const auth = await requireAdmin(supabase)
  if (auth instanceof NextResponse) return auth

  let body: { action?: unknown; note?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!isReviewAction(body.action)) {
    return NextResponse.json(
      { error: 'Unknown action. Expected "approve" or "request_changes".' },
      { status: 400 },
    )
  }
  const action = body.action

  if (body.note !== undefined && body.note !== null && typeof body.note !== 'string') {
    return NextResponse.json({ error: 'Note must be text.' }, { status: 400 })
  }
  const note = (body.note as string | null | undefined) ?? null

  try {
    const admin = createAdminClient()

    // Read through the service role: an article awaiting review is invisible
    // to every other client by RLS, including the reviewer's own session.
    const { data: article, error: loadError } = await admin
      .from('content_modules')
      .select('id, slug, title, body_md, review_status, published_at')
      .eq('id', params.id)
      .maybeSingle()

    if (loadError) throw loadError
    if (!article) return NextResponse.json({ error: 'Article not found' }, { status: 404 })

    const from = article.review_status as ReviewStatus

    const transition = resolveTransition({ from, action, note })
    if (!transition.ok) {
      return NextResponse.json({ error: transition.error }, { status: 409 })
    }

    const now = new Date()
    const update: Record<string, unknown> = {
      review_status: transition.to,
      reviewed_by: auth.id,
      reviewed_at: now.toISOString(),
      review_note: transition.note,
    }
    if (transition.to === 'approved') {
      update.published_at = publishedAtAfterApproval(article.published_at, now)
    }

    // Guard on the status we read. If someone else reviewed this article in
    // between, no row matches and we say so rather than silently overwriting
    // their decision with one taken against a stale view of the article.
    const { data: updated, error: updateError } = await admin
      .from('content_modules')
      .update(update)
      .eq('id', article.id)
      .eq('review_status', from)
      .select('id, slug, review_status, published_at, reviewed_at, review_note')
      .maybeSingle()

    if (updateError) throw updateError
    if (!updated) {
      return NextResponse.json(
        {
          error:
            'Someone else reviewed this article a moment ago. Please reload the page and look at it again.',
        },
        { status: 409 },
      )
    }

    // Audit trail. Written after the fact, so a failure here cannot block a
    // decision that has already been made — but it is loud, because a sign-off
    // nobody can trace is not much of a sign-off.
    const { error: eventError } = await admin.from('content_review_events').insert({
      module_id: article.id,
      slug: article.slug,
      from_status: from,
      to_status: transition.to,
      note: transition.note,
      content_snapshot: reviewedContentOf(article),
      actor_id: auth.id,
      actor_email: auth.email,
    })
    if (eventError) {
      console.error('Failed to record review event for article', article.slug, eventError)
    }

    return NextResponse.json({ success: true, article: updated })
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 })
  }
}
