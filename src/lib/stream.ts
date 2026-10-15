import { createHmac, createPrivateKey, sign, timingSafeEqual, type KeyObject } from 'crypto'
import { z } from 'zod'
import { VIDEO_ACCESS_LEVELS, type VideoAccess, type VideoStatus } from './stream-shared'

/**
 * Cloudflare Stream — video hosting.
 *
 * Every video lives in Cloudflare Stream and is created with
 * `requireSignedURLs: true`, so a Stream video id on its own plays nothing.
 * Playback needs a short-lived token that only our server signs, and only
 * after it has decided the viewer is allowed to watch (see `canWatch`). That
 * one rule is what keeps a premium video from being shared as a bare link.
 *
 * Who may watch is our decision, made per video in the `videos` table (036):
 *
 *   public     anyone, signed in or not  (e.g. the welcome video on /)
 *   signed_in  any signed-in user, free or premium
 *   premium    premium users (and admins, who resolve to premium in access.ts)
 *
 * Server-only: this module reads the API token and the signing key.
 *
 * Sources (developers.cloudflare.com/stream):
 *   - direct creator uploads:  /uploading-videos/direct-creator-uploads/
 *   - webhooks + signatures:   /manage-video-library/using-webhooks/
 *   - token claims:            /viewing-videos/download-videos/ (example payload)
 *   - player embed:            /viewing-videos/using-the-stream-player/
 */

// ─── Access ─────────────────────────────────────────────────────────────────

export {
  VIDEO_ACCESS_LEVELS,
  VIDEO_ACCESS_LABELS,
  DIRECT_UPLOAD_MAX_BYTES,
  type VideoAccess,
  type VideoStatus,
  type VideoRow,
} from './stream-shared'

export interface Viewer {
  signedIn: boolean
  /** Effective premium from getUserAccess — admins count as premium. */
  isPremium: boolean
}

export type WatchDecision =
  | { allowed: true }
  | { allowed: false; reason: 'sign_in_required' | 'premium_required' }

export function canWatch(access: VideoAccess, viewer: Viewer): WatchDecision {
  switch (access) {
    case 'public':
      return { allowed: true }
    case 'signed_in':
      return viewer.signedIn
        ? { allowed: true }
        : { allowed: false, reason: 'sign_in_required' }
    case 'premium':
      if (!viewer.signedIn) return { allowed: false, reason: 'sign_in_required' }
      return viewer.isPremium
        ? { allowed: true }
        : { allowed: false, reason: 'premium_required' }
    default: {
      // An access level this code doesn't know about must never fall open.
      const _exhaustive: never = access
      void _exhaustive
      return { allowed: false, reason: 'premium_required' }
    }
  }
}

// ─── Status ────────────────────────────────────────────────────────────────

/** The parts of a Stream video object (API or webhook body) we rely on. */
export const streamVideoSchema = z.object({
  uid: z.string(),
  readyToStream: z.boolean().optional(),
  duration: z.number().optional(),
  status: z
    .object({
      state: z.string().optional(),
      errorReasonCode: z.string().optional(),
      errReasonCode: z.string().optional(),
      errorReasonText: z.string().optional(),
      errReasonText: z.string().optional(),
    })
    .partial()
    .optional(),
})
export type StreamVideo = z.infer<typeof streamVideoSchema>

/**
 * Map Stream's processing state onto ours.
 *
 * `ready` requires `readyToStream === true` — Cloudflare's docs say that flag,
 * not `state`, decides whether a video can play. Stream's docs spell the error
 * fields both `errorReasonCode` and `errReasonCode` in different places, so
 * both are read.
 */
export function mapStreamStatus(video: StreamVideo): {
  status: VideoStatus
  errorReason: string | null
  durationSeconds: number | null
} {
  const state = video.status?.state
  const duration =
    typeof video.duration === 'number' && video.duration > 0 ? video.duration : null

  if (state === 'error') {
    const code = video.status?.errorReasonCode || video.status?.errReasonCode || ''
    const text = video.status?.errorReasonText || video.status?.errReasonText || ''
    return {
      status: 'error',
      errorReason: [code, text].filter(Boolean).join(': ') || 'Cloudflare could not process this video.',
      durationSeconds: duration,
    }
  }
  if (video.readyToStream === true) {
    return { status: 'ready', errorReason: null, durationSeconds: duration }
  }
  // 'pendingupload' is a direct-upload URL nobody has posted a file to yet.
  // Any other unfamiliar state is treated as still processing, never ready.
  if (state === 'pendingupload' || state === undefined) {
    return { status: 'awaiting_upload', errorReason: null, durationSeconds: null }
  }
  return { status: 'processing', errorReason: null, durationSeconds: duration }
}

// ─── Configuration ─────────────────────────────────────────────────────────

/** Stream video ids are 32 lowercase hex characters. */
export const STREAM_UID_PATTERN = /^[a-f0-9]{32}$/

/**
 * Customer subdomain code, e.g. the `abc123` in
 * customer-abc123.cloudflarestream.com. Strict so it can be interpolated into
 * a hostname without any chance of injecting a different host.
 */
const CUSTOMER_CODE_PATTERN = /^[a-z0-9]+$/

export class StreamNotConfiguredError extends Error {
  constructor(missing: string[]) {
    super(`Cloudflare Stream is not configured: missing ${missing.join(', ')}`)
    this.name = 'StreamNotConfiguredError'
  }
}

function requireEnv(keys: string[]): Record<string, string> {
  const missing = keys.filter((k) => !process.env[k])
  if (missing.length) throw new StreamNotConfiguredError(missing)
  return Object.fromEntries(keys.map((k) => [k, process.env[k] as string]))
}

function apiConfig() {
  const env = requireEnv(['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_STREAM_API_TOKEN'])
  return {
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: env.CLOUDFLARE_STREAM_API_TOKEN,
  }
}

export function customerCode(): string {
  const { CLOUDFLARE_STREAM_CUSTOMER_CODE: code } = requireEnv([
    'CLOUDFLARE_STREAM_CUSTOMER_CODE',
  ])
  if (!CUSTOMER_CODE_PATTERN.test(code)) {
    throw new Error(
      'CLOUDFLARE_STREAM_CUSTOMER_CODE should be just the code (e.g. "abc123"), ' +
        'not the full customer-….cloudflarestream.com host.',
    )
  }
  return code
}

// ─── REST API ──────────────────────────────────────────────────────────────

const API_BASE = 'https://api.cloudflare.com/client/v4'

interface ApiEnvelope<T> {
  success: boolean
  result: T
  errors?: { code?: number; message?: string }[]
}

async function streamApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { accountId, apiToken } = apiConfig()
  const res = await fetch(`${API_BASE}/accounts/${accountId}/stream${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
    cache: 'no-store',
  })

  let body: ApiEnvelope<T> | null = null
  try {
    body = (await res.json()) as ApiEnvelope<T>
  } catch {
    // fall through to the error below
  }
  if (!res.ok || !body?.success) {
    const detail = body?.errors?.map((e) => e.message).filter(Boolean).join('; ')
    throw new StreamApiError(res.status, `Cloudflare Stream API ${res.status}${detail ? `: ${detail}` : ''}`)
  }
  return body.result
}

export class StreamApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'StreamApiError'
    this.status = status
  }
}

/**
 * Ask Stream for a one-time upload URL. The browser then posts the file
 * straight to Cloudflare, so the video never passes through our servers and
 * the API token never reaches the browser.
 *
 * `maxDurationSeconds` is required by Stream: it reserves that much storage
 * until the upload arrives, then releases whatever wasn't used.
 */
export async function createDirectUpload(opts: {
  maxDurationSeconds: number
  name: string
}): Promise<{ uid: string; uploadURL: string }> {
  const result = await streamApi<{ uid: string; uploadURL: string }>('/direct_upload', {
    method: 'POST',
    body: JSON.stringify({
      maxDurationSeconds: opts.maxDurationSeconds,
      // Fail closed: playable only with a token we sign.
      requireSignedURLs: true,
      meta: { name: opts.name },
    }),
  })
  if (!STREAM_UID_PATTERN.test(result.uid) || !result.uploadURL?.startsWith('https://')) {
    throw new Error('Cloudflare Stream returned an unexpected direct upload response.')
  }
  return result
}

export async function getStreamVideo(uid: string): Promise<StreamVideo> {
  const result = await streamApi<unknown>(`/${uid}`)
  return streamVideoSchema.parse(result)
}

/**
 * Adopt a video that was uploaded some other way (the Cloudflare dashboard,
 * for files over the 200 MB direct-upload limit). It is switched to
 * requireSignedURLs first, so linking a video can only ever make it more
 * private, never less.
 */
export async function linkExistingVideo(uid: string): Promise<StreamVideo> {
  const result = await streamApi<unknown>(`/${uid}`, {
    method: 'POST',
    body: JSON.stringify({ requireSignedURLs: true }),
  })
  return streamVideoSchema.parse(result)
}

// ─── One-time setup (the "Set up video hosting" button in /admin/videos) ──

/** Videos on the account. Doubles as "is Stream on, and can this token use it?". */
export async function listStreamVideos(): Promise<{ uid: string; thumbnail?: string; preview?: string }[]> {
  return streamApi<{ uid: string; thumbnail?: string; preview?: string }[]>('')
}

/**
 * Create a signing key. Cloudflare returns the private key in this response
 * only — it cannot be fetched again — so the caller must hand it straight to
 * whoever is putting it into Vercel. It is checked here against the parser
 * the playback route uses, so a format surprise fails now, not in production.
 */
export async function createSigningKey(): Promise<{ id: string; pem: string }> {
  const result = await streamApi<Record<string, unknown>>('/keys', { method: 'POST' })
  const id = typeof result.id === 'string' ? result.id : null
  const pem = typeof result.pem === 'string' ? result.pem : null
  if (!id || !pem) {
    // Field names only — never values.
    throw new Error(`Unexpected signing key response (fields: ${Object.keys(result).join(', ')})`)
  }
  parseSigningKey(pem)
  return { id, pem }
}

/**
 * Point Stream's "video ready" webhook at the app. One per account: this
 * replaces any existing registration, and the previous secret stops working.
 */
export async function registerWebhook(notificationUrl: string): Promise<{ notificationUrl: string; secret: string }> {
  return streamApi<{ notificationUrl: string; secret: string }>('/webhook', {
    method: 'PUT',
    body: JSON.stringify({ notificationUrl }),
  })
}

/**
 * The end-to-end proof that playback is protected, run against the real
 * account: a video's thumbnail must be refused WITHOUT a token and served
 * WITH one this app signed.
 */
export async function verifyPlaybackSecurity(uid: string): Promise<{
  unsignedStatus: number
  signedStatus: number
  ok: boolean
}> {
  if (!STREAM_UID_PATTERN.test(uid)) throw new Error('Invalid Stream video id.')
  const unsigned = `https://customer-${customerCode()}.cloudflarestream.com/${uid}/thumbnails/thumbnail.jpg`
  const { thumbnailUrl } = playbackUrls(uid)
  const [open, signed] = await Promise.all([
    fetch(unsigned, { cache: 'no-store' }),
    fetch(thumbnailUrl, { cache: 'no-store' }),
  ])
  return { unsignedStatus: open.status, signedStatus: signed.status, ok: !open.ok && signed.ok }
}

// ─── Signed playback tokens ────────────────────────────────────────────────

/**
 * How long a playback link stays valid. It has to outlast the longest video
 * plus pauses (the player keeps fetching segments with the same token), and
 * be short enough that a copied link soon stops working.
 */
export const PLAYBACK_TOKEN_TTL_SECONDS = 4 * 60 * 60

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

/**
 * Cloudflare hands the signing key's PEM back base64-encoded; people also
 * paste the decoded PEM straight into env vars. Accept both, and turn the
 * literal "\n" that some env UIs store back into newlines.
 */
export function parseSigningKey(raw: string): KeyObject {
  const trimmed = raw.trim()
  const pem = trimmed.includes('-----BEGIN')
    ? trimmed.replace(/\\n/g, '\n')
    : Buffer.from(trimmed, 'base64').toString('utf8')
  if (!pem.includes('-----BEGIN')) {
    throw new Error(
      'CLOUDFLARE_STREAM_SIGNING_KEY_PEM is not a PEM key (raw or base64-encoded).',
    )
  }
  return createPrivateKey(pem)
}

let cachedKey: { raw: string; key: KeyObject } | null = null

function signingKey(): { id: string; key: KeyObject } {
  const env = requireEnv([
    'CLOUDFLARE_STREAM_SIGNING_KEY_ID',
    'CLOUDFLARE_STREAM_SIGNING_KEY_PEM',
  ])
  const raw = env.CLOUDFLARE_STREAM_SIGNING_KEY_PEM
  if (cachedKey?.raw !== raw) cachedKey = { raw, key: parseSigningKey(raw) }
  return { id: env.CLOUDFLARE_STREAM_SIGNING_KEY_ID, key: cachedKey.key }
}

/**
 * Sign a playback token locally (RS256 JWT) instead of calling Cloudflare's
 * token endpoint on every page view: no network round-trip, and no API quota
 * consumed by readers.
 *
 * Claims follow Cloudflare's documented payload: `sub` (video uid), `kid`
 * (signing key id), `exp`, `nbf`. `nbf` is backdated a minute to absorb clock
 * skew between Vercel and Cloudflare.
 */
export function signPlaybackToken(
  uid: string,
  opts: {
    keyId: string
    key: KeyObject
    nowSeconds?: number
    ttlSeconds?: number
  },
): { token: string; expiresAt: number } {
  if (!STREAM_UID_PATTERN.test(uid)) throw new Error('Invalid Stream video id.')
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000)
  const exp = now + (opts.ttlSeconds ?? PLAYBACK_TOKEN_TTL_SECONDS)

  const header = { alg: 'RS256', kid: opts.keyId }
  const payload = { sub: uid, kid: opts.keyId, exp, nbf: now - 60 }

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`
  const signature = sign('RSA-SHA256', Buffer.from(signingInput), opts.key)
  return { token: `${signingInput}.${base64url(signature)}`, expiresAt: exp }
}

/** Everything a page needs to show one video, for one viewer, for a while. */
export function playbackUrls(uid: string): {
  iframeUrl: string
  thumbnailUrl: string
  expiresAt: number
} {
  const { id, key } = signingKey()
  const { token, expiresAt } = signPlaybackToken(uid, { keyId: id, key })
  const host = `https://customer-${customerCode()}.cloudflarestream.com`
  return {
    iframeUrl: `${host}/${token}/iframe`,
    thumbnailUrl: `${host}/${token}/thumbnails/thumbnail.jpg`,
    expiresAt,
  }
}

// ─── Webhooks ──────────────────────────────────────────────────────────────

/** Reject webhook deliveries signed more than this long ago (replay guard). */
export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60

/**
 * Verify Stream's `Webhook-Signature: time=…,sig1=…` header.
 *
 * Per Cloudflare: sig1 is hex HMAC-SHA256, keyed with the webhook secret, of
 * `${time}.${rawBody}` — the body exactly as received, byte for byte, so it
 * must be read with request.text() before any JSON parsing.
 */
export function verifyWebhookSignature(
  header: string | null,
  rawBody: string,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!header || !secret) return false

  const parts = new Map<string, string>()
  for (const piece of header.split(',')) {
    const i = piece.indexOf('=')
    if (i > 0) parts.set(piece.slice(0, i).trim(), piece.slice(i + 1).trim())
  }
  const time = parts.get('time')
  const sig = parts.get('sig1')
  if (!time || !sig || !/^\d+$/.test(time) || !/^[a-f0-9]+$/i.test(sig)) return false

  if (Math.abs(nowSeconds - Number(time)) > WEBHOOK_TOLERANCE_SECONDS) return false

  const expected = createHmac('sha256', secret).update(`${time}.${rawBody}`).digest()
  const received = Buffer.from(sig, 'hex')
  return received.length === expected.length && timingSafeEqual(received, expected)
}

// ─── Admin input ───────────────────────────────────────────────────────────

/** Columns of `videos` (036) the admin screens read. */
export const VIDEO_COLUMNS =
  'id, slug, title, stream_uid, access, status, error_reason, duration_seconds, created_at, updated_at'


const VIDEO_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const titleSchema = z
  .string()
  .trim()
  .min(1, 'Give the video a title — it is read out by screen readers.')
  .max(200, 'Titles must be 200 characters or fewer.')

const slugSchema = z
  .string()
  .trim()
  .min(1, 'The video key cannot be empty.')
  .max(80, 'The video key is too long.')
  .regex(VIDEO_SLUG_PATTERN, 'The video key can only use lowercase letters, numbers and hyphens.')

const accessSchema = z.enum(VIDEO_ACCESS_LEVELS)

export const createVideoUploadSchema = z.object({
  mode: z.literal('upload'),
  title: titleSchema,
  slug: slugSchema,
  access: accessSchema,
  /** Longest the file could be, in minutes; reserves Stream storage. */
  maxDurationMinutes: z.number().int().min(1).max(360),
})

export const linkVideoSchema = z.object({
  mode: z.literal('link'),
  title: titleSchema,
  slug: slugSchema,
  access: accessSchema,
  stream_uid: z
    .string()
    .trim()
    .toLowerCase()
    .regex(STREAM_UID_PATTERN, 'That does not look like a Stream video id (32 letters and numbers).'),
})

export const createVideoSchema = z.discriminatedUnion('mode', [
  createVideoUploadSchema,
  linkVideoSchema,
])

export const updateVideoSchema = z
  .object({ title: titleSchema, slug: slugSchema, access: accessSchema })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update.')
