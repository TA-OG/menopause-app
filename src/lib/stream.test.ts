import { createHmac, generateKeyPairSync, verify } from 'crypto'
import { describe, expect, it } from 'vitest'
import {
  canWatch,
  createVideoSchema,
  mapStreamStatus,
  parseSigningKey,
  PLAYBACK_TOKEN_TTL_SECONDS,
  signPlaybackToken,
  updateVideoSchema,
  verifyWebhookSignature,
  WEBHOOK_TOLERANCE_SECONDS,
} from './stream'

const UID = '6b9e68b07dfee8cc2d116e4c51d6a957'

describe('canWatch', () => {
  const signedOut = { signedIn: false, isPremium: false }
  const free = { signedIn: true, isPremium: false }
  const premium = { signedIn: true, isPremium: true }

  it('lets anyone watch a public video', () => {
    expect(canWatch('public', signedOut)).toEqual({ allowed: true })
    expect(canWatch('public', free)).toEqual({ allowed: true })
  })

  it('asks signed-out viewers to sign in for signed_in videos', () => {
    expect(canWatch('signed_in', signedOut)).toEqual({ allowed: false, reason: 'sign_in_required' })
    expect(canWatch('signed_in', free)).toEqual({ allowed: true })
  })

  it('keeps premium videos from free and signed-out viewers', () => {
    expect(canWatch('premium', signedOut)).toEqual({ allowed: false, reason: 'sign_in_required' })
    expect(canWatch('premium', free)).toEqual({ allowed: false, reason: 'premium_required' })
    expect(canWatch('premium', premium)).toEqual({ allowed: true })
  })

  it('fails closed on an access level it does not know', () => {
    // e.g. a value added to the DB enum before the code learned about it
    expect(canWatch('staff_only' as never, premium).allowed).toBe(false)
  })
})

describe('mapStreamStatus', () => {
  it('is ready only when readyToStream is true', () => {
    expect(mapStreamStatus({ uid: UID, readyToStream: true, duration: 42.5, status: { state: 'ready' } }))
      .toEqual({ status: 'ready', errorReason: null, durationSeconds: 42.5 })
    expect(mapStreamStatus({ uid: UID, readyToStream: false, status: { state: 'ready' } }).status)
      .toBe('processing')
  })

  it('reports errors with Cloudflare’s reason, under either spelling', () => {
    expect(
      mapStreamStatus({
        uid: UID,
        readyToStream: false,
        status: { state: 'error', errReasonCode: 'ERR_NON_VIDEO', errReasonText: 'The upload is not a video.' },
      }),
    ).toMatchObject({ status: 'error', errorReason: 'ERR_NON_VIDEO: The upload is not a video.' })
    expect(
      mapStreamStatus({ uid: UID, status: { state: 'error', errorReasonCode: 'ERR_UNKNOWN' } }).errorReason,
    ).toBe('ERR_UNKNOWN')
  })

  it('treats a not-yet-uploaded video as awaiting upload', () => {
    expect(mapStreamStatus({ uid: UID, readyToStream: false, status: { state: 'pendingupload' } }).status)
      .toBe('awaiting_upload')
  })

  it('treats any other state as still processing, and ignores Stream’s -1 duration', () => {
    expect(mapStreamStatus({ uid: UID, readyToStream: false, duration: -1, status: { state: 'downloading' } }))
      .toEqual({ status: 'processing', errorReason: null, durationSeconds: null })
  })
})

describe('signPlaybackToken', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const pem = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString()

  function decode(part: string) {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
  }

  it('produces an RS256 JWT with Cloudflare’s documented claims', () => {
    const now = 1_700_000_000
    const { token, expiresAt } = signPlaybackToken(UID, { keyId: 'key-123', key: privateKey, nowSeconds: now })
    const [h, p, s] = token.split('.')

    expect(decode(h)).toEqual({ alg: 'RS256', kid: 'key-123' })
    expect(decode(p)).toEqual({
      sub: UID,
      kid: 'key-123',
      exp: now + PLAYBACK_TOKEN_TTL_SECONDS,
      nbf: now - 60,
    })
    expect(expiresAt).toBe(now + PLAYBACK_TOKEN_TTL_SECONDS)
    expect(verify('RSA-SHA256', Buffer.from(`${h}.${p}`), publicKey, Buffer.from(s, 'base64url'))).toBe(true)
  })

  it('refuses anything that is not a Stream video id', () => {
    expect(() => signPlaybackToken('../../etc', { keyId: 'k', key: privateKey })).toThrow()
  })

  it('accepts the signing key raw, base64-encoded, or with escaped newlines', () => {
    const fromBase64 = parseSigningKey(Buffer.from(pem).toString('base64'))
    const fromEscaped = parseSigningKey(pem.replace(/\n/g, '\\n'))
    for (const key of [parseSigningKey(pem), fromBase64, fromEscaped]) {
      const { token } = signPlaybackToken(UID, { keyId: 'k', key })
      const [h, p, s] = token.split('.')
      expect(verify('RSA-SHA256', Buffer.from(`${h}.${p}`), publicKey, Buffer.from(s, 'base64url'))).toBe(true)
    }
  })

  it('rejects a value that is not a key at all', () => {
    expect(() => parseSigningKey('not-a-key')).toThrow(/PEM/)
  })
})

describe('verifyWebhookSignature', () => {
  const secret = '85011ed3a913c6ad5f9cf6c5573cc0a7'
  const body = '{"uid":"6b9e68b07dfee8cc2d116e4c51d6a957","readyToStream":true}'
  const now = 1_230_811_200

  function header(time: number, payload = body, key = secret) {
    const sig = createHmac('sha256', key).update(`${time}.${payload}`).digest('hex')
    return `time=${time},sig1=${sig}`
  }

  it('accepts a correctly signed, fresh delivery', () => {
    expect(verifyWebhookSignature(header(now), body, secret, now)).toBe(true)
  })

  it('rejects a tampered body', () => {
    expect(verifyWebhookSignature(header(now), body.replace('true', 'false'), secret, now)).toBe(false)
  })

  it('rejects the wrong secret', () => {
    expect(verifyWebhookSignature(header(now, body, 'other'), body, secret, now)).toBe(false)
  })

  it('rejects a stale delivery (replay)', () => {
    expect(verifyWebhookSignature(header(now), body, secret, now + WEBHOOK_TOLERANCE_SECONDS + 1)).toBe(false)
  })

  it('rejects a missing or malformed header, or an unset secret', () => {
    expect(verifyWebhookSignature(null, body, secret, now)).toBe(false)
    expect(verifyWebhookSignature('garbage', body, secret, now)).toBe(false)
    expect(verifyWebhookSignature(`time=${now},sig1=zz`, body, secret, now)).toBe(false)
    expect(verifyWebhookSignature(header(now), body, '', now)).toBe(false)
  })
})

describe('admin input', () => {
  it('validates an upload request', () => {
    const ok = createVideoSchema.safeParse({
      mode: 'upload', title: 'Welcome to Aunty Mel', slug: 'welcome', access: 'public', maxDurationMinutes: 10,
    })
    expect(ok.success).toBe(true)
  })

  it('normalises and validates a linked Stream id', () => {
    const ok = createVideoSchema.safeParse({
      mode: 'link', title: 'T', slug: 'long-talk', access: 'premium', stream_uid: ` ${UID.toUpperCase()} `,
    })
    expect(ok.success && ok.data.mode === 'link' && ok.data.stream_uid).toBe(UID)
    expect(createVideoSchema.safeParse({
      mode: 'link', title: 'T', slug: 'x', access: 'premium', stream_uid: 'abc',
    }).success).toBe(false)
  })

  it('rejects bad keys and unknown access levels', () => {
    const base = { mode: 'upload', title: 'T', maxDurationMinutes: 5 }
    expect(createVideoSchema.safeParse({ ...base, slug: 'Welcome Video', access: 'public' }).success).toBe(false)
    expect(createVideoSchema.safeParse({ ...base, slug: 'welcome', access: 'everyone' }).success).toBe(false)
  })

  it('requires an update to change something', () => {
    expect(updateVideoSchema.safeParse({}).success).toBe(false)
    expect(updateVideoSchema.safeParse({ access: 'signed_in' }).success).toBe(true)
  })
})
