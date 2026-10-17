import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserAccess } from '@/lib/access'
import { rateLimit } from '@/lib/rate-limit'
import { canWatch, playbackUrls, type VideoAccess } from '@/lib/stream'

/**
 * GET /api/videos/[slug]/playback
 *
 * The one place a playback token is ever signed. Looks the video up by slug,
 * decides whether this viewer may watch it, and only then returns a signed
 * player URL that expires (PLAYBACK_TOKEN_TTL_SECONDS).
 *
 *   200 { title, iframeUrl, thumbnailUrl, expiresAt }
 *   403 { reason: 'sign_in_required' | 'premium_required', title }
 *   404 no such video, or not ready to play yet
 *
 * Public videos (the welcome page) work signed out, so this route must not
 * require a session — it reads one if present.
 */

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } },
) {
  const { success } = await rateLimit(request, { limit: 60, windowMs: 60_000 })
  if (!success) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429, headers: NO_STORE })
  }

  const admin = createAdminClient()
  const { data: video, error } = await admin
    .from('videos')
    .select('title, stream_uid, access, status')
    .eq('slug', params.slug)
    .maybeSingle()

  if (error) {
    console.error('Video lookup failed', { slug: params.slug, error })
    return NextResponse.json({ error: 'Video unavailable' }, { status: 500, headers: NO_STORE })
  }
  if (!video || video.status !== 'ready') {
    return NextResponse.json({ error: 'Video not found' }, { status: 404, headers: NO_STORE })
  }

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const isPremium = user ? (await getUserAccess(supabase, user.id)).isPremium : false

  const decision = canWatch(video.access as VideoAccess, { signedIn: !!user, isPremium })
  if (!decision.allowed) {
    return NextResponse.json(
      { reason: decision.reason, title: video.title },
      { status: 403, headers: NO_STORE },
    )
  }

  try {
    const urls = playbackUrls(video.stream_uid)
    return NextResponse.json({ title: video.title, ...urls }, { headers: NO_STORE })
  } catch (err) {
    // Almost always a missing/invalid CLOUDFLARE_STREAM_* env var. Logged in
    // full server-side; the reader just sees the video as unavailable.
    console.error('Could not sign video playback', { slug: params.slug, error: err })
    return NextResponse.json({ error: 'Video unavailable' }, { status: 503, headers: NO_STORE })
  }
}
