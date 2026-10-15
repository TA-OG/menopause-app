/**
 * Cloudflare Stream setup — one command.
 *
 *   npm run stream-setup -- all --app-url https://auntymel.app --test-video ./clip.mp4
 *
 * Does everything that can be done from a terminal, in order, and is safe to
 * re-run: anything already configured is checked and kept, never recreated.
 *
 *   1. Cloudflare API token + account   (asks for the token if it isn't set)
 *   2. Confirms Stream is enabled and the token can use it
 *   3. Signing key                       (creates one only if none configured)
 *   4. "Video ready" webhook             (registers only if no secret yet)
 *   5. Saves everything to .env.local
 *   6. Pushes the variables to Vercel    (Production + Preview), if
 *                                        VERCEL_TOKEN is set — see below
 *   7. Checks migration 036 is applied
 *   8. With --test-video: uploads it, waits for Cloudflare to process it,
 *      proves it is refused WITHOUT a token and plays WITH one, then deletes
 *      it. This is the end-to-end check that playback security works.
 *
 * Flags
 *   --app-url <url>       live site, for the webhook (default NEXT_PUBLIC_APP_URL)
 *   --test-video <file>   short video (≤ 200 MB) for the end-to-end check
 *   --rotate-webhook      re-register the webhook even if a secret exists
 *                         (the old secret stops working — update Vercel too)
 *   --dry-run             report what would happen; change nothing anywhere
 *
 * Vercel (optional): set VERCEL_TOKEN (vercel.com/account/tokens) and either
 * run `vercel link` once (writes .vercel/project.json) or set
 * VERCEL_PROJECT_ID (+ VERCEL_TEAM_ID for a team project).
 *
 * What it cannot do, and says so at the end: subscribe to Stream (billing,
 * dashboard only), create the API token (needs a logged-in human), redeploy,
 * the privacy-notice wording, and captions.
 *
 * Single steps are still available:
 *   npm run stream-setup -- signing-key | webhook <url> | check <video-id>
 */
import * as dotenv from 'dotenv'
import { existsSync, openAsBlob, readFileSync, statSync, writeFileSync } from 'fs'
import path from 'path'
import { createInterface } from 'readline'

dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

import {
  DIRECT_UPLOAD_MAX_BYTES,
  mapStreamStatus,
  parseSigningKey,
  playbackUrls,
  STREAM_UID_PATTERN,
  streamVideoSchema,
} from '../src/lib/stream'
import { customerCodeFromUrl, upsertEnvFile, webhookUrlFor } from '../src/lib/stream-setup'

const CF_API = 'https://api.cloudflare.com/client/v4'
const ENV_FILE = '.env.local'

const ENV_KEYS = [
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_STREAM_API_TOKEN',
  'CLOUDFLARE_STREAM_CUSTOMER_CODE',
  'CLOUDFLARE_STREAM_SIGNING_KEY_ID',
  'CLOUDFLARE_STREAM_SIGNING_KEY_PEM',
  'CLOUDFLARE_STREAM_WEBHOOK_SECRET',
] as const
type EnvKey = (typeof ENV_KEYS)[number]

// ─── Output ────────────────────────────────────────────────────────────────

type Outcome = { step: string; status: 'done' | 'kept' | 'skipped' | 'manual' | 'failed'; note: string }
const outcomes: Outcome[] = []
const ICON: Record<Outcome['status'], string> = {
  done: '✓', kept: '✓', skipped: '–', manual: '→', failed: '✗',
}

function record(step: string, status: Outcome['status'], note: string) {
  outcomes.push({ step, status, note })
  console.log(`${ICON[status]} ${step}: ${note}`)
}

// ─── Cloudflare API ────────────────────────────────────────────────────────

class CloudflareError extends Error {
  constructor(message: string, readonly status: number, readonly codes: number[]) {
    super(message)
  }
}

async function cf<T>(method: string, apiPath: string, body?: unknown): Promise<T> {
  const res = await fetch(`${CF_API}${apiPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.CLOUDFLARE_STREAM_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = (await res.json().catch(() => null)) as
    | { success: boolean; result: T; errors?: { code?: number; message?: string }[] }
    | null
  if (!res.ok || !json?.success) {
    const errors = json?.errors ?? []
    const detail = errors.map((e) => e.message).filter(Boolean).join('; ')
    throw new CloudflareError(
      `Cloudflare API ${res.status} on ${method} ${apiPath}${detail ? ` — ${detail}` : ''}`,
      res.status,
      errors.map((e) => e.code ?? 0),
    )
  }
  return json.result
}

const stream = <T>(method: string, p: string, body?: unknown) =>
  cf<T>(method, `/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/stream${p}`, body)

// ─── Small utilities ───────────────────────────────────────────────────────

function parseArgs(argv: string[]) {
  const flags = new Map<string, string | true>()
  const positional: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) positional.push(a)
    else if (argv[i + 1] && !argv[i + 1].startsWith('--') && !['--dry-run', '--rotate-webhook'].includes(a)) {
      flags.set(a.slice(2), argv[++i])
    } else flags.set(a.slice(2), true)
  }
  return { positional, flags }
}

/** Prompt without echoing what is typed (for the API token). */
function askSecret(question: string): Promise<string> {
  if (!process.stdin.isTTY) return Promise.resolve('')
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    const rlOut = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream }
    process.stdout.write(question)
    rlOut._writeToOutput = () => {} // swallow the echo
    rl.question('', (answer) => {
      rl.close()
      process.stdout.write('\n')
      resolve(answer.trim())
    })
  })
}

function ask(question: string): Promise<string> {
  if (!process.stdin.isTTY) return Promise.resolve('')
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a.trim()) }))
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ─── Steps ─────────────────────────────────────────────────────────────────

async function ensureCredentials(): Promise<boolean> {
  if (!process.env.CLOUDFLARE_STREAM_API_TOKEN) {
    console.log(
      '\nNeed a Cloudflare API token with Account › Stream › Edit.\n' +
        'Create one: dash.cloudflare.com → My Profile → API Tokens → Create Token → Custom token.',
    )
    const token = await askSecret('Paste the token (input hidden): ')
    if (!token) {
      record('API token', 'failed', 'not set — put CLOUDFLARE_STREAM_API_TOKEN in .env.local or paste it when asked')
      return false
    }
    process.env.CLOUDFLARE_STREAM_API_TOKEN = token
  }

  if (!process.env.CLOUDFLARE_ACCOUNT_ID) {
    const accounts = await cf<{ id: string; name: string }[]>('GET', '/accounts')
    if (accounts.length === 1) {
      process.env.CLOUDFLARE_ACCOUNT_ID = accounts[0].id
    } else if (accounts.length > 1) {
      accounts.forEach((a, i) => console.log(`  ${i + 1}. ${a.name} (${a.id})`))
      const pick = Number(await ask('Which account? '))
      const chosen = accounts[pick - 1]
      if (!chosen) {
        record('Account', 'failed', 'no account chosen — set CLOUDFLARE_ACCOUNT_ID')
        return false
      }
      process.env.CLOUDFLARE_ACCOUNT_ID = chosen.id
    } else {
      record('Account', 'failed', 'this token cannot see any account')
      return false
    }
  }
  return true
}

/** Lists videos — doubles as "is Stream on, and can this token use it?". */
async function checkStreamAccess(): Promise<unknown[] | null> {
  try {
    const videos = await stream<unknown[]>('GET', '')
    record('Stream access', 'done', `token works; ${videos.length} existing video(s) on the account`)
    return videos
  } catch (err) {
    if (!(err instanceof CloudflareError)) {
      const cause = (err as Error & { cause?: { code?: string } }).cause?.code ?? (err as Error).message
      record('Stream access', 'failed', `could not reach api.cloudflare.com (${cause}) — check your connection`)
      return null
    }
    const e = err
    const hint =
      e.status === 403 || e.status === 401
        ? 'the token lacks Stream: Edit on this account, or Stream is not subscribed (dashboard → Stream)'
        : e.message
    record('Stream access', 'failed', hint)
    return null
  }
}

function discoverCustomerCode(videos: unknown[]) {
  if (process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE) {
    record('Customer code', 'kept', process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE)
    return
  }
  for (const v of videos) {
    const o = v as { thumbnail?: string; preview?: string }
    const code = customerCodeFromUrl(o.thumbnail) ?? customerCodeFromUrl(o.preview)
    if (code) {
      process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE = code
      record('Customer code', 'done', `${code} (read from an existing video)`)
      return
    }
  }
  // Filled in from the test video later, if one is given.
}

async function ensureSigningKey(dryRun: boolean) {
  const { CLOUDFLARE_STREAM_SIGNING_KEY_ID: id, CLOUDFLARE_STREAM_SIGNING_KEY_PEM: pem } = process.env
  if (id && pem) {
    try {
      parseSigningKey(pem)
      record('Signing key', 'kept', `already configured (${id})`)
    } catch (err) {
      record('Signing key', 'failed', `configured but unreadable: ${(err as Error).message}`)
    }
    return
  }
  if (dryRun) return record('Signing key', 'skipped', 'would create one (dry run)')

  const result = await stream<Record<string, unknown>>('POST', '/keys')
  const newId = typeof result.id === 'string' ? result.id : null
  const newPem = typeof result.pem === 'string' ? result.pem : null
  if (!newId || !newPem) {
    // Field names only — never values.
    record('Signing key', 'failed', `unexpected response (fields: ${Object.keys(result).join(', ')})`)
    return
  }
  parseSigningKey(newPem) // fail now, not in production, if the format is not what we sign with
  process.env.CLOUDFLARE_STREAM_SIGNING_KEY_ID = newId
  process.env.CLOUDFLARE_STREAM_SIGNING_KEY_PEM = newPem
  record('Signing key', 'done', `created (${newId})`)
}

async function ensureWebhook(appUrl: string | undefined, rotate: boolean, dryRun: boolean) {
  if (process.env.CLOUDFLARE_STREAM_WEBHOOK_SECRET && !rotate) {
    record('Webhook', 'kept', 'secret already configured (use --rotate-webhook to replace it)')
    return
  }
  if (!appUrl) {
    record('Webhook', 'failed', 'pass --app-url https://<live-site> (or set NEXT_PUBLIC_APP_URL)')
    return
  }
  let url: string
  try {
    url = webhookUrlFor(appUrl)
  } catch (err) {
    record('Webhook', 'failed', (err as Error).message)
    return
  }
  if (dryRun) return record('Webhook', 'skipped', `would point at ${url} (dry run)`)

  const result = await stream<{ notificationUrl: string; secret: string }>('PUT', '/webhook', {
    notificationUrl: url,
  })
  process.env.CLOUDFLARE_STREAM_WEBHOOK_SECRET = result.secret
  record('Webhook', 'done', `points at ${result.notificationUrl}`)
}

function collectEnv(): Partial<Record<EnvKey, string>> {
  const out: Partial<Record<EnvKey, string>> = {}
  for (const k of ENV_KEYS) if (process.env[k]) out[k] = process.env[k]
  return out
}

function saveEnvFile(dryRun: boolean) {
  const values = collectEnv() as Record<string, string>
  const names = Object.keys(values)
  if (dryRun) return record(ENV_FILE, 'skipped', `would write ${names.length} variable(s) (dry run)`)
  const current = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8') : ''
  writeFileSync(ENV_FILE, upsertEnvFile(current, values), { mode: 0o600 })
  record(ENV_FILE, 'done', `saved ${names.join(', ')}`)
}

function vercelProject(): { projectId: string; teamId?: string } | null {
  if (process.env.VERCEL_PROJECT_ID) {
    return { projectId: process.env.VERCEL_PROJECT_ID, teamId: process.env.VERCEL_TEAM_ID }
  }
  const file = path.join('.vercel', 'project.json')
  if (!existsSync(file)) return null
  const { projectId, orgId } = JSON.parse(readFileSync(file, 'utf8')) as { projectId?: string; orgId?: string }
  if (!projectId) return null
  return { projectId, teamId: orgId?.startsWith('team_') ? orgId : undefined }
}

async function pushToVercel(dryRun: boolean) {
  const token = process.env.VERCEL_TOKEN
  const project = vercelProject()
  const values = collectEnv()
  const missing = ENV_KEYS.filter((k) => !values[k])

  if (!token || !project) {
    record(
      'Vercel',
      'manual',
      'add the six CLOUDFLARE_* values from .env.local to Vercel (Production + Preview) — ' +
        'or set VERCEL_TOKEN and run `vercel link`, then re-run this',
    )
    return
  }
  if (missing.length) {
    record('Vercel', 'skipped', `not pushed — still missing ${missing.join(', ')}`)
    return
  }
  if (dryRun) return record('Vercel', 'skipped', `would upsert ${ENV_KEYS.length} variables (dry run)`)

  const qs = new URLSearchParams({ upsert: 'true' })
  if (project.teamId) qs.set('teamId', project.teamId)
  const res = await fetch(`https://api.vercel.com/v10/projects/${project.projectId}/env?${qs}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(
      ENV_KEYS.map((key) => ({
        key,
        value: values[key],
        type: 'encrypted',
        target: ['production', 'preview'],
      })),
    ),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
    record('Vercel', 'failed', `HTTP ${res.status}${body?.error?.message ? ` — ${body.error.message}` : ''}`)
    return
  }
  record('Vercel', 'done', 'six variables set for Production + Preview — redeploy for them to take effect')
}

async function checkMigration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    record('Migration 036', 'manual', 'cannot check (no Supabase env) — make sure supabase/migrations/036_videos.sql is applied')
    return
  }
  const res = await fetch(`${url}/rest/v1/videos?select=id&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  if (res.ok) record('Migration 036', 'kept', 'videos table exists')
  else if (res.status === 404) {
    record(
      'Migration 036',
      'manual',
      'videos table not found — apply supabase/migrations/036_videos.sql the way previous migrations were applied',
    )
  } else {
    record('Migration 036', 'failed', `could not check (Supabase HTTP ${res.status})`)
  }
}

/** Without a token must fail; with an app-signed token must succeed. */
async function verifyPlayback(uid: string): Promise<boolean> {
  const unsigned = `https://customer-${process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE}.cloudflarestream.com/${uid}/thumbnails/thumbnail.jpg`
  const { thumbnailUrl } = playbackUrls(uid)
  const [open, signed] = await Promise.all([fetch(unsigned), fetch(thumbnailUrl)])

  const privateOk = !open.ok
  const signedOk = signed.ok
  record('Unsigned request refused', privateOk ? 'done' : 'failed',
    privateOk ? `HTTP ${open.status}` : `HTTP ${open.status} — THIS VIDEO IS PUBLIC`)
  record('App-signed request accepted', signedOk ? 'done' : 'failed',
    signedOk ? `HTTP ${signed.status}` : `HTTP ${signed.status} — signing key, key format or customer code is wrong`)
  return privateOk && signedOk
}

async function endToEnd(file: string | undefined, dryRun: boolean) {
  if (!file) {
    record('End-to-end check', 'manual',
      're-run with --test-video <short clip>, or later: npm run stream-setup -- check <video-id>')
    return
  }
  if (!existsSync(file)) return record('End-to-end check', 'failed', `${file} not found`)
  const size = statSync(file).size
  if (size > DIRECT_UPLOAD_MAX_BYTES) return record('End-to-end check', 'failed', 'test video must be ≤ 200 MB')
  if (dryRun) return record('End-to-end check', 'skipped', `would upload ${file} (dry run)`)
  for (const k of ['CLOUDFLARE_STREAM_SIGNING_KEY_ID', 'CLOUDFLARE_STREAM_SIGNING_KEY_PEM'] as const) {
    if (!process.env[k]) return record('End-to-end check', 'skipped', `${k} missing`)
  }

  const upload = await stream<{ uid: string; uploadURL: string }>('POST', '/direct_upload', {
    maxDurationSeconds: 600,
    requireSignedURLs: true,
    meta: { name: 'stream-setup end-to-end check (safe to delete)' },
  })
  const uid = upload.uid
  try {
    const form = new FormData()
    form.append('file', await openAsBlob(file), path.basename(file))
    const res = await fetch(upload.uploadURL, { method: 'POST', body: form })
    if (!res.ok) throw new Error(`upload refused (HTTP ${res.status})`)
    console.log('  uploaded; waiting for Cloudflare to process it…')

    const deadline = Date.now() + 10 * 60_000
    let details = streamVideoSchema.passthrough().parse(await stream('GET', `/${uid}`))
    while (mapStreamStatus(details).status !== 'ready') {
      const { status, errorReason } = mapStreamStatus(details)
      if (status === 'error') throw new Error(`Cloudflare could not process it: ${errorReason}`)
      if (Date.now() > deadline) throw new Error('still not ready after 10 minutes')
      await sleep(5_000)
      details = streamVideoSchema.passthrough().parse(await stream('GET', `/${uid}`))
    }

    if (!process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE) {
      const d = details as { thumbnail?: string; preview?: string }
      const code = customerCodeFromUrl(d.thumbnail) ?? customerCodeFromUrl(d.preview)
      if (!code) throw new Error('could not read the customer code from the test video')
      process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE = code
      record('Customer code', 'done', `${code} (read from the test video)`)
    }

    const ok = await verifyPlayback(uid)
    record('End-to-end check', ok ? 'done' : 'failed',
      ok ? 'playback security verified against the real account' : 'see the two lines above')
  } catch (err) {
    record('End-to-end check', 'failed', (err as Error).message)
  } finally {
    try {
      await stream('DELETE', `/${uid}`)
      console.log('  test video deleted')
    } catch {
      console.log(`  could not delete the test video ${uid} — remove it in the dashboard (Stream → Videos)`)
    }
  }
}

// ─── Commands ──────────────────────────────────────────────────────────────

async function all(flags: Map<string, string | true>) {
  const dryRun = flags.has('dry-run')
  const appUrl = (flags.get('app-url') as string | undefined) ?? process.env.NEXT_PUBLIC_APP_URL
  const testVideo = flags.get('test-video') as string | undefined
  if (dryRun) console.log('Dry run — nothing will be created or written.\n')

  if (!(await ensureCredentials())) return finish()
  record('Account', 'done', process.env.CLOUDFLARE_ACCOUNT_ID as string)

  const videos = await checkStreamAccess()
  if (!videos) return finish()

  discoverCustomerCode(videos)
  await ensureSigningKey(dryRun)
  await ensureWebhook(appUrl, flags.has('rotate-webhook'), dryRun)
  // Save before the slower steps, so a failure later never loses a key
  // Cloudflare will not show again.
  saveEnvFile(dryRun)
  await checkMigration()
  const codeBefore = process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE
  await endToEnd(testVideo, dryRun)
  if (!dryRun && process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE !== codeBefore) saveEnvFile(false)
  await pushToVercel(dryRun)
  return finish()
}

function finish() {
  if (!process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE && outcomes.every((o) => o.step !== 'Customer code')) {
    record('Customer code', 'manual',
      'not found yet — pass --test-video, or copy it from any video’s embed code (customer-<code>.cloudflarestream.com)')
  }
  record('Redeploy', 'manual', 'redeploy on Vercel once the variables are in')
  record('Privacy notice', 'manual', 'add Cloudflare as a processor in src/app/privacy/page.tsx (section 4) — wording is yours')
  record('Captions', 'manual', 'add captions to every video before it goes on a page')

  const failed = outcomes.filter((o) => o.status === 'failed')
  console.log(failed.length ? `\n✗ ${failed.length} step(s) failed — fix and re-run; finished steps are kept.` : '\n✓ Setup complete apart from the → items above.')
  process.exitCode = failed.length ? 1 : 0
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2))
  const [command, arg] = positional

  switch (command) {
    case 'all':
      return all(flags)
    case 'signing-key':
      if (!(await ensureCredentials())) return
      delete process.env.CLOUDFLARE_STREAM_SIGNING_KEY_ID
      delete process.env.CLOUDFLARE_STREAM_SIGNING_KEY_PEM
      await ensureSigningKey(false)
      return saveEnvFile(false)
    case 'webhook':
      if (!(await ensureCredentials())) return
      await ensureWebhook(arg, true, false)
      return saveEnvFile(false)
    case 'check':
      if (!arg || !STREAM_UID_PATTERN.test(arg)) throw new Error('Pass a Stream video id (32 hex characters).')
      if (!process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE) throw new Error('CLOUDFLARE_STREAM_CUSTOMER_CODE is not set.')
      process.exitCode = (await verifyPlayback(arg)) ? 0 : 1
      return
    default:
      console.error(
        'Usage:\n' +
          '  npm run stream-setup -- all [--app-url <url>] [--test-video <file>] [--rotate-webhook] [--dry-run]\n' +
          '  npm run stream-setup -- signing-key | webhook <url> | check <video-id>',
      )
      process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(`✗ ${err instanceof Error ? err.message : err}`)
  process.exitCode = 1
})
