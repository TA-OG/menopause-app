import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin-auth'
import { rateLimit } from '@/lib/rate-limit'
import { verifyPlaybackSecurity } from '@/lib/stream'

/**
 * POST /api/admin/videos/[id]/verify — "Test playback security".
 *
 * Runs the end-to-end check on the live deployment for one ready video: its
 * thumbnail must be refused without a token and served with one this app
 * signs. A pass proves the signing key, its format, the customer code and
 * requireSignedURLs are all correct in production.
 */

export const dynamic = 'force-dynamic'

export async function POST(
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

  const { data: video, error } = await createAdminClient()
    .from('videos')
    .select('stream_uid, status')
    .eq('id', params.id)
    .maybeSingle()
  if (error) {
    console.error('Verify: video lookup failed', { id: params.id, error })
    return NextResponse.json({ error: 'Could not load the video.' }, { status: 500 })
  }
  if (!video) return NextResponse.json({ error: 'Video not found' }, { status: 404 })
  if (video.status !== 'ready') {
    return NextResponse.json({ error: 'Wait until the video is Ready, then test it.' }, { status: 409 })
  }

  try {
    const result = await verifyPlaybackSecurity(video.stream_uid)
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('Verify: check failed', { id: params.id, message: (err as Error).message })
    return NextResponse.json(
      { error: 'Could not run the check — usually a missing or malformed CLOUDFLARE_STREAM_* value.' },
      { status: 503 },
    )
  }
}
