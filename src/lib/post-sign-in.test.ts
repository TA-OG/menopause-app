// A dummy key so importing the module graph (complimentary-premium constructs
// a Stripe client at module scope) doesn't throw.
process.env.STRIPE_SECRET_KEY ??= 'sk_test_dummy'
process.env.STRIPE_PRICE_GBP_MONTHLY ??= 'price_test_gbp_monthly'

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { User } from '@supabase/supabase-js'

vi.mock('stripe', () => ({
  default: class {
    subscriptions = { create: vi.fn(), retrieve: vi.fn() }
    customers = { create: vi.fn(), retrieve: vi.fn() }
  },
}))

const activate = vi.hoisted(() => vi.fn())
const claim = vi.hoisted(() => vi.fn())

vi.mock('@/lib/complimentary-premium', () => ({
  activatePendingComplimentaryPremium: activate,
}))
vi.mock('@/lib/referral-rewards', () => ({
  claimReferral: claim,
}))

import { completeSignIn, safeNext } from './post-sign-in'

function fakeSupabase(profile: Record<string, unknown> | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: profile, error: null }) }),
      }),
    }),
  } as unknown as Parameters<typeof completeSignIn>[0]
}

const admin = {} as Parameters<typeof completeSignIn>[1]

function fakeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'her@example.com',
    user_metadata: {},
    app_metadata: {},
    aud: 'authenticated',
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as User
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('safeNext', () => {
  it('allows a plain in-app path', () => {
    expect(safeNext('/my-plan')).toBe('/my-plan')
  })

  it('falls back when there is no next', () => {
    expect(safeNext(null)).toBe('/dashboard')
    expect(safeNext(undefined)).toBe('/dashboard')
    expect(safeNext('')).toBe('/dashboard')
  })

  it('refuses to send a freshly signed-in user off-site', () => {
    // An invite link reshaped into an open redirect would drop a woman who has
    // just authenticated onto a look-alike site.
    expect(safeNext('https://evil.example')).toBe('/dashboard')
    expect(safeNext('//evil.example')).toBe('/dashboard')
    expect(safeNext('/\\evil.example')).toBe('/dashboard')
    expect(safeNext('javascript:alert(1)')).toBe('/dashboard')
  })
})

describe('completeSignIn', () => {
  it('starts a pending complimentary grant on sign-in', async () => {
    const supabase = fakeSupabase({ onboarding_complete: true })

    const destination = await completeSignIn(supabase, admin, fakeUser(), {
      next: '/my-plan',
    })

    expect(activate).toHaveBeenCalledWith(admin, 'user-1', 'her@example.com')
    expect(destination).toBe('/my-plan')
  })

  it('sends a user who has not finished onboarding to /onboarding', async () => {
    const supabase = fakeSupabase({ onboarding_complete: false })

    const destination = await completeSignIn(supabase, admin, fakeUser(), {
      next: '/my-plan',
    })

    expect(destination).toBe('/onboarding')
  })

  it('claims a referral passed in the query string', async () => {
    const supabase = fakeSupabase({ onboarding_complete: true })

    await completeSignIn(supabase, admin, fakeUser(), { refCode: 'FRIEND123' })

    expect(claim).toHaveBeenCalledWith(admin, 'user-1', 'FRIEND123')
  })

  it('falls back to the referral code carried in user metadata', async () => {
    const supabase = fakeSupabase({ onboarding_complete: true })
    const user = fakeUser({ user_metadata: { referral_code: 'FROM_META' } })

    await completeSignIn(supabase, admin, user)

    expect(claim).toHaveBeenCalledWith(admin, 'user-1', 'FROM_META')
  })

  it('does not claim a referral when there is none', async () => {
    const supabase = fakeSupabase({ onboarding_complete: true })

    await completeSignIn(supabase, admin, fakeUser())

    expect(claim).not.toHaveBeenCalled()
  })

  it('skips activation for a user with no email rather than crashing', async () => {
    const supabase = fakeSupabase({ onboarding_complete: true })

    const destination = await completeSignIn(
      supabase,
      admin,
      fakeUser({ email: undefined }),
    )

    expect(activate).not.toHaveBeenCalled()
    expect(destination).toBe('/dashboard')
  })

  it('never returns an off-site destination', async () => {
    const supabase = fakeSupabase({ onboarding_complete: true })

    const destination = await completeSignIn(supabase, admin, fakeUser(), {
      next: 'https://evil.example/steal',
    })

    expect(destination).toBe('/dashboard')
  })
})
