import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin-auth'
import { rateLimit } from '@/lib/rate-limit'
import { sanitizeError } from '@/lib/sanitize-error'
import { getStreamVideo, mapStreamStatus, updateVideoSchema, VIDEO_COLUMNS } from '@/lib/stream'

/**
 * One video.
 *
 * PATCH /api/admin/videos/[id]  → change title, key (slug) or who can watch
 * POST  /api/admin/videos/[id]  → "Check status": pull processing state from
 *                                 Cloudflare now, instead of waiting for the
 *                                 webhook (or if the webhook isn't set up yet)
 *
 * There is deliberately no DELETE: removing a video that a page still asks
 * for by key would break that page. Delete in the Cloudflare dashboard and
 * here together, deliberately, if it is ever needed.
 */

export const dynamic = 'force-dynamic'

export async function PATCH(
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

  const parsed = updateVideoSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? 'Those details are not valid.' },
      { status: 400 },
    )
  }

  try {
    const { data, error } = await createAdminClient()
      .from('videos')
      .update({ ...parsed.data, updated_by: auth.id })
      .eq('id', params.id)
      .select(VIDEO_COLUMNS)
      .maybeSingle()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'That key is already used by another video.' }, { status: 409 })
      }
      throw error
    }
    if (!data) return NextResponse.json({ error: 'Video not found' }, { status: 404 })

    return NextResponse.json({ video: data })
  } catch (err) {
    console.error('Failed to update video', { actor_id: auth.id, id: params.id, error: err })
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 })
  }
}

export async function POST(
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

  const admin = createAdminClient()
  try {
    const { data: video, error: findError } = await admin
      .from('videos')
      .select('stream_uid')
      .eq('id', params.id)
      .maybeSingle()
    if (findError) throw findError
    if (!video) return NextResponse.json({ error: 'Video not found' }, { status: 404 })

    const state = mapStreamStatus(await getStreamVideo(video.stream_uid))

    const { data, error } = await admin
      .from('videos')
      .update({
        status: state.status,
        error_reason: state.errorReason,
        ...(state.durationSeconds !== null ? { duration_seconds: state.durationSeconds } : {}),
      })
      .eq('id', params.id)
      .select(VIDEO_COLUMNS)
      .single()
    if (error) throw error

    return NextResponse.json({ video: data })
  } catch (err) {
    console.error('Failed to refresh video status', { actor_id: auth.id, id: params.id, error: err })
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 })
  }
}
