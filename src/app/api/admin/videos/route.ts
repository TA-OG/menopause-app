import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin-auth'
import { rateLimit } from '@/lib/rate-limit'
import { sanitizeError } from '@/lib/sanitize-error'
import {
  createDirectUpload,
  createVideoSchema,
  linkExistingVideo,
  mapStreamStatus,
  VIDEO_COLUMNS,
  type VideoStatus,
} from '@/lib/stream'

/**
 * Video library — list and add.
 *
 * GET  /api/admin/videos  → every video
 * POST /api/admin/videos  → add one, either:
 *   { mode: 'upload', … }  → returns a one-time Cloudflare upload URL the
 *                            browser posts the file to directly (≤ 200 MB)
 *   { mode: 'link', stream_uid, … } → adopt a video already in Stream (for
 *                            larger files uploaded in the Cloudflare dashboard)
 *
 * Both paths leave the video requiring signed URLs, so adding a video never
 * makes it watchable by anyone until the playback route says so.
 */

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { success } = await rateLimit(request, { limit: 60, windowMs: 60_000 })
  if (!success) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  const supabase = createClient()
  const auth = await requireAdmin(supabase)
  if (auth instanceof NextResponse) return auth

  try {
    const { data, error } = await createAdminClient()
      .from('videos')
      .select(VIDEO_COLUMNS)
      .order('updated_at', { ascending: false })
    if (error) throw error
    return NextResponse.json({ videos: data ?? [] })
  } catch (err) {
    console.error('Failed to list videos', { actor_id: auth.id, error: err })
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const { success } = await rateLimit(request, { limit: 20, windowMs: 60_000 })
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

  const parsed = createVideoSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? 'Those details are not valid.' },
      { status: 400 },
    )
  }
  const input = parsed.data
  const admin = createAdminClient()

  // Check the key before touching Cloudflare, so a clash doesn't leave an
  // orphaned upload reservation behind. The UNIQUE constraint still decides.
  const { data: clash } = await admin.from('videos').select('id').eq('slug', input.slug).maybeSingle()
  if (clash) {
    return NextResponse.json(
      { error: `The key "${input.slug}" is already used by another video.` },
      { status: 409 },
    )
  }

  try {
    let streamUid: string
    let uploadURL: string | null = null
    let state: { status: VideoStatus; errorReason: string | null; durationSeconds: number | null } = {
      status: 'awaiting_upload',
      errorReason: null,
      durationSeconds: null,
    }

    if (input.mode === 'upload') {
      const upload = await createDirectUpload({
        maxDurationSeconds: input.maxDurationMinutes * 60,
        name: input.title,
      })
      streamUid = upload.uid
      uploadURL = upload.uploadURL
    } else {
      const video = await linkExistingVideo(input.stream_uid)
      streamUid = input.stream_uid
      state = mapStreamStatus(video)
    }

    const { data: created, error } = await admin
      .from('videos')
      .insert({
        slug: input.slug,
        title: input.title,
        access: input.access,
        stream_uid: streamUid,
        status: state.status,
        error_reason: state.errorReason,
        duration_seconds: state.durationSeconds,
        created_by: auth.id,
        updated_by: auth.id,
      })
      .select(VIDEO_COLUMNS)
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'That key or Stream video is already in the library.' },
          { status: 409 },
        )
      }
      throw error
    }

    return NextResponse.json({ video: created, uploadURL }, { status: 201 })
  } catch (err) {
    console.error('Failed to add video', { actor_id: auth.id, mode: input.mode, error: err })
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 })
  }
}
