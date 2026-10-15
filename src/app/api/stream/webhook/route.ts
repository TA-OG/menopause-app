import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mapStreamStatus, streamVideoSchema, verifyWebhookSignature } from '@/lib/stream'

/**
 * POST /api/stream/webhook
 *
 * Cloudflare Stream calls this when a video finishes processing or fails.
 * Registered once per account (scripts/stream-setup.ts → `webhook`), which
 * returns the secret stored as CLOUDFLARE_STREAM_WEBHOOK_SECRET.
 *
 * Unsigned or badly signed requests are refused before anything is parsed.
 * A video id we don't know is acknowledged and ignored — the same Stream
 * account may hold videos that aren't in this app's library.
 *
 * /admin/videos can also pull status directly ("Check status"), so a missed
 * delivery delays a video becoming playable but never loses it.
 */

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const secret = process.env.CLOUDFLARE_STREAM_WEBHOOK_SECRET
  if (!secret) {
    console.error('Stream webhook received but CLOUDFLARE_STREAM_WEBHOOK_SECRET is not set')
    return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  }

  // Raw text, not .json(): the signature covers the exact bytes received.
  const rawBody = await request.text()
  if (!verifyWebhookSignature(request.headers.get('webhook-signature'), rawBody, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let payload
  try {
    payload = streamVideoSchema.parse(JSON.parse(rawBody))
  } catch {
    return NextResponse.json({ error: 'Unexpected payload' }, { status: 400 })
  }

  const { status, errorReason, durationSeconds } = mapStreamStatus(payload)

  const admin = createAdminClient()
  const { error } = await admin
    .from('videos')
    .update({
      status,
      error_reason: errorReason,
      ...(durationSeconds !== null ? { duration_seconds: durationSeconds } : {}),
    })
    .eq('stream_uid', payload.uid)

  if (error) {
    console.error('Stream webhook: failed to update video', { uid: payload.uid, error })
    // 500 so Cloudflare treats the delivery as failed rather than done.
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
