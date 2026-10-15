/**
 * One-time Cloudflare Stream setup, and an end-to-end check that it works.
 *
 *   npm run stream-setup -- signing-key
 *       Creates a signing key. Prints CLOUDFLARE_STREAM_SIGNING_KEY_ID and
 *       CLOUDFLARE_STREAM_SIGNING_KEY_PEM to put in Vercel. Cloudflare shows
 *       the private key once — it cannot be fetched again.
 *
 *   npm run stream-setup -- webhook https://auntymel.app/api/stream/webhook
 *       Points Stream's "video ready" webhook at the app (one per account;
 *       this replaces any existing one). Prints CLOUDFLARE_STREAM_WEBHOOK_SECRET.
 *
 *   npm run stream-setup -- check <stream-video-id>
 *       Proves playback security end to end against the real account:
 *         1. the video's thumbnail WITHOUT a token must be refused, and
 *         2. WITH a token signed by this app it must load.
 *       Run this once after setup, with a video that has finished processing.
 *
 * Reads CLOUDFLARE_* from .env.local / .env, like the other scripts.
 */
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

import { customerCode, playbackUrls, STREAM_UID_PATTERN } from '../src/lib/stream'

const API_BASE = 'https://api.cloudflare.com/client/v4'

function env(key: string): string {
  const v = process.env[key]
  if (!v) {
    console.error(`✗ ${key} is not set (.env.local or .env).`)
    process.exit(1)
  }
  return v
}

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}/accounts/${env('CLOUDFLARE_ACCOUNT_ID')}/stream${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env('CLOUDFLARE_STREAM_API_TOKEN')}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = (await res.json().catch(() => null)) as
    | { success: boolean; result: T; errors?: { message?: string }[] }
    | null
  if (!res.ok || !json?.success) {
    const detail = json?.errors?.map((e) => e.message).join('; ') ?? ''
    throw new Error(`Cloudflare API ${res.status} on ${method} ${path} ${detail}`)
  }
  return json.result
}

async function createSigningKey() {
  const result = await api<Record<string, unknown>>('POST', '/keys')
  const id = typeof result.id === 'string' ? result.id : null
  const pem = typeof result.pem === 'string' ? result.pem : null
  if (!id || !pem) {
    // Don't guess at a format we didn't get. Field names only — no values.
    throw new Error(
      `Unexpected response shape; fields returned: ${Object.keys(result).join(', ')}. ` +
        'Create the key in the dashboard instead and paste its id and PEM.',
    )
  }
  console.log('✓ Signing key created. Add these to Vercel (Production + Preview) and .env.local.')
  console.log('  This is a private key: do not commit it or paste it anywhere else.\n')
  console.log(`CLOUDFLARE_STREAM_SIGNING_KEY_ID=${id}`)
  console.log(`CLOUDFLARE_STREAM_SIGNING_KEY_PEM=${pem}`)
}

async function registerWebhook(url: string | undefined) {
  if (!url || !/^https:\/\/[^/]+\/api\/stream\/webhook$/.test(url)) {
    throw new Error('Pass the full URL, e.g. https://auntymel.app/api/stream/webhook')
  }
  const result = await api<{ notificationUrl: string; secret: string }>('PUT', '/webhook', {
    notificationUrl: url,
  })
  console.log(`✓ Webhook now points at ${result.notificationUrl}. Add this to Vercel:\n`)
  console.log(`CLOUDFLARE_STREAM_WEBHOOK_SECRET=${result.secret}`)
}

async function check(uid: string | undefined) {
  if (!uid || !STREAM_UID_PATTERN.test(uid)) {
    throw new Error('Pass a Stream video id (32 hex characters).')
  }
  const unsigned = `https://customer-${customerCode()}.cloudflarestream.com/${uid}/thumbnails/thumbnail.jpg`
  const { thumbnailUrl } = playbackUrls(uid)

  const [open, signed] = await Promise.all([fetch(unsigned), fetch(thumbnailUrl)])
  const privateOk = !open.ok
  const signedOk = signed.ok

  console.log(`${privateOk ? '✓' : '✗'} Without a token: HTTP ${open.status} ${privateOk ? '(refused, as it should be)' : '— THIS VIDEO IS PUBLIC'}`)
  console.log(`${signedOk ? '✓' : '✗'} With an app-signed token: HTTP ${signed.status}${signedOk ? '' : ' — signing key or customer code is wrong, or the video is not ready'}`)

  if (!privateOk || !signedOk) process.exit(1)
  console.log('\n✓ Playback security verified end to end.')
}

async function main() {
  const [command, arg] = process.argv.slice(2)
  switch (command) {
    case 'signing-key':
      return createSigningKey()
    case 'webhook':
      return registerWebhook(arg)
    case 'check':
      return check(arg)
    default:
      console.error('Usage: npm run stream-setup -- <signing-key | webhook <url> | check <video-id>>')
      process.exit(1)
  }
}

main().catch((err) => {
  console.error(`✗ ${err instanceof Error ? err.message : err}`)
  process.exit(1)
})
