import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin-auth'
import { rateLimit } from '@/lib/rate-limit'
import { sanitizeError } from '@/lib/sanitize-error'
import { recordRevision } from '@/lib/article-revisions'
import {
  updateArticleSchema,
  estimateReadMinutes,
  publicationState,
} from '@/lib/article-authoring'

/**
 * One Learn article — read, edit, delete.
 *
 * GET    /api/admin/articles/[id]   → the article, drafts included
 * PATCH  /api/admin/articles/[id]   → save changes
 * DELETE /api/admin/articles/[id]   → remove it, only while it is not live
 *
 * Editing a live article publishes the change immediately. That is deliberate:
 * Pamela writes the articles and is the clinical authority on them, so there
 * is nobody else to wait for, and a correction to a wrong dose needs to reach
 * readers the moment she makes it — not after a second approval step.
 *
 * Nothing here can publish or unpublish. That lives in ./publish/route.ts so
 * "change the words" and "change who can see it" are never the same request.
 */

export const dynamic = 'force-dynamic'

/** Columns a revision snapshot needs, plus what the editor renders. */
const ARTICLE_COLUMNS =
  'id, slug, title, body_md, tier, category, tags, estimated_read_minutes, published_at, created_at, updated_at, created_by, updated_by'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const { success } = await rateLimit(request, { limit: 60, windowMs: 60_000 })
  if (!success) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  const supabase = createClient()
  const auth = await requireAdmin(supabase)
  if (auth instanceof NextResponse) return auth

  try {
    const admin = createAdminClient()
    const { data: article, error } = await admin
      .from('content_modules')
      .select(ARTICLE_COLUMNS)
      .eq('id', params.id)
      .maybeSingle()

    if (error) throw error
    if (!article) {
      return NextResponse.json({ error: 'Article not found' }, { status: 404 })
    }

    // History, newest first, for the "what changed" panel in the editor.
    const { data: revisions, error: revisionError } = await admin
      .from('content_module_revisions')
      .select('id, action, actor_email, created_at, title')
      .eq('module_id', params.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (revisionError) {
      // History is useful, not essential — a failure to read it must not stop
      // the author opening her article.
      console.error('Failed to load article history', {
        module_id: params.id,
        error: revisionError.message,
      })
    }

    return NextResponse.json({ article, revisions: revisions ?? [] })
  } catch (err) {
    console.error('Failed to load article', {
      module_id: params.id,
      actor_id: auth.id,
      error: err,
    })
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const { success } = await rateLimit(request, { limit: 60, windowMs: 60_000 })
  if (!success) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  const supabase = createClient()
  const auth = await requireAdmin(supabase)
  if (auth instanceof NextResponse) return auth

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = updateArticleSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? 'Those details are not valid.' },
      { status: 400 },
    )
  }
  const input = parsed.data

  if (Object.keys(input).length === 0) {
    return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 })
  }

  // Optional lost-update guard. The editor sends the updated_at it loaded; if
  // the row has moved on since (a second tab, a second device), we refuse
  // rather than silently overwriting the other save.
  const expectedUpdatedAt =
    typeof (raw as { expected_updated_at?: unknown })?.expected_updated_at === 'string'
      ? (raw as { expected_updated_at: string }).expected_updated_at
      : null

  try {
    const admin = createAdminClient()

    const { data: current, error: loadError } = await admin
      .from('content_modules')
      .select(ARTICLE_COLUMNS)
      .eq('id', params.id)
      .maybeSingle()

    if (loadError) throw loadError
    if (!current) {
      return NextResponse.json({ error: 'Article not found' }, { status: 404 })
    }

    const update: Record<string, unknown> = { ...input, updated_by: auth.id }

    // Recompute reading time whenever the body changes, unless the author set
    // it herself in the same save.
    if (input.body_md !== undefined && input.estimated_read_minutes === undefined) {
      update.estimated_read_minutes = estimateReadMinutes(input.body_md)
    }

    let query = admin.from('content_modules').update(update).eq('id', params.id)
    if (expectedUpdatedAt) query = query.eq('updated_at', expectedUpdatedAt)

    const { data: updated, error: updateError } = await query
      .select(ARTICLE_COLUMNS)
      .maybeSingle()

    if (updateError) {
      if (updateError.code === '23505') {
        return NextResponse.json(
          { error: 'Another article already uses that web address.' },
          { status: 409 },
        )
      }
      throw updateError
    }

    if (!updated) {
      // The row exists (we loaded it above), so no match means the guard
      // failed: someone saved this article in between.
      return NextResponse.json(
        {
          error:
            'This article was changed somewhere else while you were editing. ' +
            'Reload the page to see the current version before saving again.',
        },
        { status: 409 },
      )
    }

    await recordRevision(admin, 'edited', updated, { id: auth.id, email: auth.email })

    return NextResponse.json({ article: updated })
  } catch (err) {
    console.error('Failed to save article', {
      module_id: params.id,
      actor_id: auth.id,
      error: err,
    })
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const { success } = await rateLimit(request, { limit: 20, windowMs: 60_000 })
  if (!success) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  const supabase = createClient()
  const auth = await requireAdmin(supabase)
  if (auth instanceof NextResponse) return auth

  try {
    const admin = createAdminClient()

    const { data: article, error: loadError } = await admin
      .from('content_modules')
      .select(ARTICLE_COLUMNS)
      .eq('id', params.id)
      .maybeSingle()

    if (loadError) throw loadError
    if (!article) {
      return NextResponse.json({ error: 'Article not found' }, { status: 404 })
    }

    // Refuse to delete something readers can currently see. Taking an article
    // away from under them is an unpublish, which is reversible and recorded —
    // deletion is neither, so it has to be a deliberate second step.
    if (publicationState(article.published_at) !== 'draft') {
      return NextResponse.json(
        {
          error:
            'This article is published. Unpublish it first, then delete it — ' +
            'that way it disappears from the app before it disappears from here.',
        },
        { status: 409 },
      )
    }

    // Record before deleting: the snapshot is the only remaining copy of the
    // wording afterwards. content_module_revisions has no foreign key to
    // content_modules precisely so this entry outlives the article.
    await recordRevision(admin, 'deleted', article, { id: auth.id, email: auth.email })

    const { error: deleteError } = await admin
      .from('content_modules')
      .delete()
      .eq('id', params.id)

    if (deleteError) throw deleteError

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Failed to delete article', {
      module_id: params.id,
      actor_id: auth.id,
      error: err,
    })
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 })
  }
}
