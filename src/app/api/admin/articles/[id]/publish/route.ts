import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin-auth'
import { rateLimit } from '@/lib/rate-limit'
import { sanitizeError } from '@/lib/sanitize-error'
import { recordRevision } from '@/lib/article-revisions'
import { publishSchema, checkPublishReadiness } from '@/lib/article-authoring'

/**
 * Put a Learn article in front of readers, or take it back down.
 *
 * POST /api/admin/articles/[id]/publish
 * Body: { action: 'publish' | 'unpublish', publish_at?: ISO string | null }
 *
 * This is the only place `published_at` is ever set, so it is the only way an
 * article can reach a woman using the app. Visibility itself is enforced by
 * RLS (026_content_modules_premium_rls.sql): published_at must be non-null and
 * in the past, and the reader must be entitled to the article's tier. Nothing
 * here can weaken that — it only moves the date.
 *
 * A future `publish_at` schedules the article: the same RLS clause makes it
 * appear on its own when the date arrives, with no job to run.
 */

export const dynamic = 'force-dynamic'

const ARTICLE_COLUMNS =
  'id, slug, title, body_md, tier, category, tags, estimated_read_minutes, published_at, created_at, updated_at'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const { success } = await rateLimit(request, { limit: 30, windowMs: 60_000 })
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

  const parsed = publishSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? 'That request is not valid.' },
      { status: 400 },
    )
  }
  const { action, publish_at: publishAt } = parsed.data

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

    if (action === 'publish') {
      // Check the article is actually fit to be read before anyone reads it.
      // An empty or half-written article reaching a woman looking for help is
      // worse than a refused publish.
      const readiness = checkPublishReadiness(article)
      if (!readiness.ready) {
        return NextResponse.json(
          {
            error: 'This article is not ready to publish yet.',
            problems: readiness.problems,
          },
          { status: 422 },
        )
      }
    }

    const nextPublishedAt =
      action === 'unpublish' ? null : publishAt ?? new Date().toISOString()

    const { data: updated, error: updateError } = await admin
      .from('content_modules')
      .update({ published_at: nextPublishedAt, updated_by: auth.id })
      .eq('id', params.id)
      .select(ARTICLE_COLUMNS)
      .maybeSingle()

    if (updateError) throw updateError
    if (!updated) {
      return NextResponse.json({ error: 'Article not found' }, { status: 404 })
    }

    await recordRevision(
      admin,
      action === 'publish' ? 'published' : 'unpublished',
      updated,
      { id: auth.id, email: auth.email },
    )

    return NextResponse.json({ article: updated })
  } catch (err) {
    console.error('Failed to change article publication', {
      module_id: params.id,
      action,
      actor_id: auth.id,
      error: err,
    })
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 })
  }
}
