import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'
import { rateLimit } from '@/lib/rate-limit'
import {
  createSigningKey,
  listStreamVideos,
  registerWebhook,
  StreamApiError,
} from '@/lib/stream'
import { customerCodeFromUrl, webhookUrlFor } from '@/lib/stream-setup'

/**
 * POST /api/admin/videos/setup — the "Set up video hosting" button.
 *
 * One-time Cloudflare setup, run on the live site using the API token
 * already in Vercel, so nobody needs a terminal. It produces the values that
 * only Cloudflare can create and returns them ONCE, for an admin to paste
 * into Vercel:
 *
 *   CLOUDFLARE_STREAM_SIGNING_KEY_ID / _PEM   (new signing key)
 *   CLOUDFLARE_STREAM_WEBHOOK_SECRET          (webhook → NEXT_PUBLIC_APP_URL)
 *   CLOUDFLARE_STREAM_CUSTOMER_CODE           (if it can be read from a video)
 *
 * Nothing is stored here: Vercel env vars cannot be written from inside a
 * deployment, and the private key must not land in our database or logs.
 * Anything already configured in this deployment is left alone. Because new
 * values only take effect after a redeploy, running it twice in a row
 * creates a second key and re-registers the webhook — the newest values are
 * then the right ones (the earlier key stays valid; the earlier webhook
 * secret does not). The UI says so.
 */

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

const bodySchema = z.object({ confirm: z.literal(true) })

type Value = { name: string; value: string; secret: boolean }

export async function POST(request: NextRequest) {
  const { success } = await rateLimit(request, { limit: 5, windowMs: 60_000 })
  if (!success) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429, headers: NO_STORE })
  }

  const supabase = createClient()
  const auth = await requireAdmin(supabase)
  if (auth instanceof NextResponse) return auth

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Confirmation required.' }, { status: 400, headers: NO_STORE })
  }

  const missingBase = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_STREAM_API_TOKEN'].filter((k) => !process.env[k])
  if (missingBase.length) {
    return NextResponse.json(
      { error: `Add ${missingBase.join(' and ')} in Vercel and redeploy first.` },
      { status: 400, headers: NO_STORE },
    )
  }

  let webhookUrl: string
  try {
    webhookUrl = webhookUrlFor(process.env.NEXT_PUBLIC_APP_URL ?? '')
  } catch (err) {
    return NextResponse.json(
      { error: `NEXT_PUBLIC_APP_URL is not usable for the webhook: ${(err as Error).message}` },
      { status: 400, headers: NO_STORE },
    )
  }

  const values: Value[] = []
  const kept: string[] = []

  try {
    // 1. Confirms the token works and Stream is on, before creating anything.
    const videos = await listStreamVideos()

    // 2. Customer code — only discoverable from an existing video.
    if (process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE) {
      kept.push('CLOUDFLARE_STREAM_CUSTOMER_CODE')
    } else {
      const code = videos
        .map((v) => customerCodeFromUrl(v.thumbnail) ?? customerCodeFromUrl(v.preview))
        .find(Boolean)
      if (code) values.push({ name: 'CLOUDFLARE_STREAM_CUSTOMER_CODE', value: code, secret: false })
    }

    // 3. Signing key.
    if (process.env.CLOUDFLARE_STREAM_SIGNING_KEY_ID && process.env.CLOUDFLARE_STREAM_SIGNING_KEY_PEM) {
      kept.push('CLOUDFLARE_STREAM_SIGNING_KEY_ID', 'CLOUDFLARE_STREAM_SIGNING_KEY_PEM')
    } else {
      const key = await createSigningKey()
      values.push(
        { name: 'CLOUDFLARE_STREAM_SIGNING_KEY_ID', value: key.id, secret: false },
        { name: 'CLOUDFLARE_STREAM_SIGNING_KEY_PEM', value: key.pem, secret: true },
      )
    }

    // 4. Webhook.
    if (process.env.CLOUDFLARE_STREAM_WEBHOOK_SECRET) {
      kept.push('CLOUDFLARE_STREAM_WEBHOOK_SECRET')
    } else {
      const hook = await registerWebhook(webhookUrl)
      values.push({ name: 'CLOUDFLARE_STREAM_WEBHOOK_SECRET', value: hook.secret, secret: true })
    }
  } catch (err) {
    // Never log values — only what failed.
    console.error('Video hosting setup failed', {
      actor_id: auth.id,
      status: err instanceof StreamApiError ? err.status : undefined,
      message: err instanceof Error ? err.message : String(err),
    })
    const message =
      err instanceof StreamApiError && (err.status === 401 || err.status === 403)
        ? 'Cloudflare refused the API token. Check it has Account › Stream › Edit for this account, and that Stream is subscribed.'
        : 'Cloudflare setup failed. Nothing was half-saved — fix the problem and run it again.'
    // Values created before the failure are still returned, so they aren't lost.
    return NextResponse.json({ error: message, values, kept, webhookUrl }, { status: 502, headers: NO_STORE })
  }

  console.info('Video hosting setup ran', { actor_id: auth.id, created: values.map((v) => v.name) })
  return NextResponse.json({ values, kept, webhookUrl }, { headers: NO_STORE })
}
