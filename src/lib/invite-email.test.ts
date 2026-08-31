import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendInviteEmail } from '@/lib/invite-email'

/**
 * Regression tests for the silent-invite bug.
 *
 * The defect these exist to prevent: Supabase refuses inviteUserByEmail for an
 * account that already exists, and every invite route used to swallow that
 * error and report success. Nobody was emailed, and the admin panel said
 * "Invited ✓". Four women were told by hand that their invite was on the way
 * and never received anything.
 *
 * The load-bearing assertion in this file is therefore not "an invite is sent"
 * — it is that an existing account still receives an email, and that when no
 * email goes out at all the result says so rather than looking like a success.
 */

const RESEND_SEND = vi.fn()

// The module imports 'resend' lazily inside the send path, matching how the
// waitlist route does it, so the mock has to be registered at module scope.
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: RESEND_SEND }
  },
}))

interface AdminStub {
  invite: ReturnType<typeof vi.fn>
  generate: ReturnType<typeof vi.fn>
  client: SupabaseClient
}

function makeAdmin(overrides?: {
  invite?: ReturnType<typeof vi.fn>
  generate?: ReturnType<typeof vi.fn>
}): AdminStub {
  const invite =
    overrides?.invite ??
    vi.fn().mockResolvedValue({
      data: { user: { id: 'new-user', last_sign_in_at: null } },
      error: null,
    })

  const generate =
    overrides?.generate ??
    vi.fn().mockResolvedValue({
      data: {
        properties: { action_link: 'https://supabase.example/auth/v1/verify?token=abc' },
        user: { id: 'existing-user', last_sign_in_at: '2026-01-01T00:00:00Z' },
      },
      error: null,
    })

  return {
    invite,
    generate,
    client: {
      auth: { admin: { inviteUserByEmail: invite, generateLink: generate } },
    } as unknown as SupabaseClient,
  }
}

const ALREADY_REGISTERED = { message: 'A user with this email address has already been registered' }

beforeEach(() => {
  RESEND_SEND.mockReset()
  RESEND_SEND.mockResolvedValue({ data: { id: 'resend-id' }, error: null })
  process.env.RESEND_API_KEY = 're_test_key'
  process.env.RESEND_FROM_EMAIL = 'hello@auntymel.app'
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('sendInviteEmail — new account', () => {
  it('sends the Supabase invite and reports it', async () => {
    const admin = makeAdmin()

    const result = await sendInviteEmail(admin.client, {
      email: 'New.Person@Example.com',
      firstName: 'Ada',
      redirectTo: 'https://auntymel.app/auth/callback?next=/onboarding',
    })

    expect(result).toMatchObject({
      status: 'invite_sent',
      failed: false,
      userId: 'new-user',
      alreadyRegistered: false,
      error: null,
    })

    // Normalised before it reaches Supabase, so the same person invited as
    // "New.Person@" and "new.person@" is one account, not two.
    expect(admin.invite).toHaveBeenCalledWith(
      'new.person@example.com',
      expect.objectContaining({
        redirectTo: 'https://auntymel.app/auth/callback?next=/onboarding',
        data: expect.objectContaining({ first_name: 'Ada' }),
      }),
    )

    // No fallback needed, so nothing should have been generated or Resent.
    expect(admin.generate).not.toHaveBeenCalled()
    expect(RESEND_SEND).not.toHaveBeenCalled()
  })
})

describe('sendInviteEmail — account already exists (the regression)', () => {
  it('still emails them, via a generated magic link', async () => {
    const admin = makeAdmin({
      invite: vi.fn().mockResolvedValue({ data: null, error: ALREADY_REGISTERED }),
    })

    const result = await sendInviteEmail(admin.client, {
      email: 'existing@example.com',
      firstName: 'Grace',
      redirectTo: 'https://auntymel.app/auth/callback?next=/onboarding',
    })

    expect(result).toMatchObject({
      status: 'magic_link_sent',
      failed: false,
      alreadyRegistered: true,
      userId: 'existing-user',
      lastSignInAt: '2026-01-01T00:00:00Z',
      error: null,
    })

    expect(admin.generate).toHaveBeenCalledWith({
      type: 'magiclink',
      email: 'existing@example.com',
      options: { redirectTo: 'https://auntymel.app/auth/callback?next=/onboarding' },
    })

    // The actual point of the fix: an email left the building.
    expect(RESEND_SEND).toHaveBeenCalledTimes(1)
    const sent = RESEND_SEND.mock.calls[0][0]
    expect(sent.to).toBe('existing@example.com')
    expect(sent.from).toBe('hello@auntymel.app')
    expect(sent.html).toContain('https://supabase.example/auth/v1/verify?token=abc')
    expect(sent.html).toContain('Grace')
  })

  it('recognises the other wording Supabase uses for the same condition', async () => {
    const admin = makeAdmin({
      invite: vi
        .fn()
        .mockResolvedValue({ data: null, error: { message: 'User already registered' } }),
    })

    const result = await sendInviteEmail(admin.client, {
      email: 'existing@example.com',
      redirectTo: 'https://auntymel.app/auth/callback',
    })

    expect(result.status).toBe('magic_link_sent')
    expect(result.alreadyRegistered).toBe(true)
  })

  it('escapes the name rather than interpolating it raw into the email', async () => {
    const admin = makeAdmin({
      invite: vi.fn().mockResolvedValue({ data: null, error: ALREADY_REGISTERED }),
    })

    await sendInviteEmail(admin.client, {
      email: 'existing@example.com',
      firstName: '<script>alert(1)</script>',
      redirectTo: 'https://auntymel.app/auth/callback',
    })

    const sent = RESEND_SEND.mock.calls[0][0]
    expect(sent.html).not.toContain('<script>')
    expect(sent.html).toContain('&lt;script&gt;')
  })
})

describe('sendInviteEmail — nothing was sent', () => {
  it('reports a Resend rejection rather than treating it as delivered', async () => {
    // Resend reports failures on the response, not by throwing. An unchecked
    // call here would look exactly like a success.
    RESEND_SEND.mockResolvedValue({ data: null, error: { message: 'Domain is not verified' } })

    const admin = makeAdmin({
      invite: vi.fn().mockResolvedValue({ data: null, error: ALREADY_REGISTERED }),
    })

    const result = await sendInviteEmail(admin.client, {
      email: 'existing@example.com',
      redirectTo: 'https://auntymel.app/auth/callback',
    })

    expect(result.status).toBe('not_sent')
    expect(result.failed).toBe(true)
    expect(result.error).toContain('Domain is not verified')
    // The account still resolved, so the caller can still schedule her premium.
    expect(result.userId).toBe('existing-user')
  })

  it('reports a Supabase send failure verbatim, and does not invent a fallback', async () => {
    const admin = makeAdmin({
      invite: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Error sending invite email' },
      }),
    })

    const result = await sendInviteEmail(admin.client, {
      email: 'new@example.com',
      redirectTo: 'https://auntymel.app/auth/callback',
    })

    expect(result).toMatchObject({ status: 'not_sent', failed: true, alreadyRegistered: false })
    expect(result.error).toContain('Error sending invite email')
    expect(admin.generate).not.toHaveBeenCalled()
    expect(RESEND_SEND).not.toHaveBeenCalled()
  })

  it('reports a failure to generate the replacement link', async () => {
    const admin = makeAdmin({
      invite: vi.fn().mockResolvedValue({ data: null, error: ALREADY_REGISTERED }),
      generate: vi
        .fn()
        .mockResolvedValue({ data: null, error: { message: 'Signups not allowed for otp' } }),
    })

    const result = await sendInviteEmail(admin.client, {
      email: 'existing@example.com',
      redirectTo: 'https://auntymel.app/auth/callback',
    })

    expect(result).toMatchObject({ status: 'not_sent', failed: true, alreadyRegistered: true })
    expect(result.error).toContain('Signups not allowed for otp')
    expect(RESEND_SEND).not.toHaveBeenCalled()
  })

  it('says so plainly when Resend is not configured at all', async () => {
    delete process.env.RESEND_API_KEY

    const admin = makeAdmin({
      invite: vi.fn().mockResolvedValue({ data: null, error: ALREADY_REGISTERED }),
    })

    const result = await sendInviteEmail(admin.client, {
      email: 'existing@example.com',
      redirectTo: 'https://auntymel.app/auth/callback',
    })

    expect(result.status).toBe('not_sent')
    expect(result.error).toContain('RESEND_API_KEY is not set')
  })

  it('never throws, even when the Supabase call itself blows up', async () => {
    const admin = makeAdmin({
      invite: vi.fn().mockRejectedValue(new Error('fetch failed')),
    })

    const result = await sendInviteEmail(admin.client, {
      email: 'new@example.com',
      redirectTo: 'https://auntymel.app/auth/callback',
    })

    expect(result).toMatchObject({ status: 'not_sent', failed: true })
    expect(result.error).toContain('fetch failed')
  })
})
