// A dummy key so importing the module (which constructs a Stripe client at
// module scope, same pattern as lib/referral-rewards.ts) doesn't throw.
process.env.STRIPE_SECRET_KEY ??= 'sk_test_dummy'
process.env.STRIPE_PRICE_GBP_MONTHLY ??= 'price_test_gbp_monthly'

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Stripe mock ───────────────────────────────────────────────────────────
// Hoisted so the module-scope `new Stripe(...)` in complimentary-premium.ts
// picks it up at import time.
const stripeMock = vi.hoisted(() => ({
  subscriptions: { create: vi.fn(), retrieve: vi.fn() },
  customers: { create: vi.fn(), retrieve: vi.fn() },
}))

vi.mock('stripe', () => ({
  default: class {
    subscriptions = stripeMock.subscriptions
    customers = stripeMock.customers
  },
}))

import {
  grantComplimentaryPremium,
  addMonths,
  COMPLIMENTARY_PREMIUM_MONTHS,
} from './complimentary-premium'

// ─── Minimal fake Supabase client ──────────────────────────────────────────
// Supports exactly the chained calls complimentary-premium.ts makes:
//   from('profiles').select(...).eq(...).maybeSingle()
//   from('profiles').update(...).eq(...)

function makeFakeSupabase(profile: Record<string, unknown> | null) {
  const updates: Record<string, unknown>[] = []

  const client = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: profile, error: null }),
        }),
      }),
      update: (patch: Record<string, unknown>) => {
        updates.push(patch)
        return { eq: async () => ({ error: null }) }
      },
    }),
    /** Test-only accessor for the profile writes that were attempted. */
    _updates: updates,
  }

  return client as unknown as Parameters<typeof grantComplimentaryPremium>[0] & {
    _updates: Record<string, unknown>[]
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('addMonths', () => {
  it('adds whole calendar months', () => {
    const result = addMonths(new Date('2026-08-19T12:00:00.000Z'), 12)
    expect(result.toISOString()).toBe('2027-08-19T12:00:00.000Z')
  })

  it('clamps 29 Feb to 28 Feb rather than rolling into March', () => {
    // 2024 is a leap year, 2025 is not.
    const result = addMonths(new Date('2024-02-29T00:00:00.000Z'), 12)
    expect(result.toISOString().slice(0, 10)).toBe('2025-02-28')
  })

  it('does not overflow when the source day exceeds the target month length', () => {
    // 31 Jan + 1 month must be 28/29 Feb, never 2/3 March.
    const result = addMonths(new Date('2026-01-31T00:00:00.000Z'), 1)
    expect(result.toISOString().slice(0, 10)).toBe('2026-02-28')
  })
})

describe('grantComplimentaryPremium', () => {
  it('creates a trial-only subscription and marks the profile premium', async () => {
    const supabase = makeFakeSupabase({
      stripe_customer_id: 'cus_existing',
      stripe_subscription_id: null,
      full_name: 'Test User',
    })
    stripeMock.customers.retrieve.mockResolvedValue({ id: 'cus_existing' })
    stripeMock.subscriptions.create.mockResolvedValue({
      id: 'sub_comp',
      status: 'trialing',
    })

    const result = await grantComplimentaryPremium(supabase, {
      userId: 'user-1',
      email: 'her@example.com',
    })

    expect(result.status).toBe('granted')
    expect(result.months).toBe(COMPLIMENTARY_PREMIUM_MONTHS)
    expect(result.stripeSubscriptionId).toBe('sub_comp')
    expect(result.expiresAt).not.toBeNull()

    // The whole period must be a trial, and must never invoice someone who
    // never entered a card.
    const args = stripeMock.subscriptions.create.mock.calls[0][0]
    expect(args.trial_end).toBeGreaterThan(Math.floor(Date.now() / 1000))
    expect(args.trial_settings.end_behavior.missing_payment_method).toBe('cancel')
    expect(args.metadata.supabase_user_id).toBe('user-1')
    expect(args.metadata.complimentary).toBe('true')

    // The webhook does not handle customer.subscription.created, so the
    // profile write has to happen here or the user stays on free.
    expect(supabase._updates).toContainEqual(
      expect.objectContaining({
        subscription_tier: 'premium',
        subscription_status: 'trialing',
        stripe_subscription_id: 'sub_comp',
      }),
    )
  })

  it('never clobbers a user who already has a live paid subscription', async () => {
    const supabase = makeFakeSupabase({
      stripe_customer_id: 'cus_paying',
      stripe_subscription_id: 'sub_paid',
      full_name: 'Paying User',
    })
    stripeMock.subscriptions.retrieve.mockResolvedValue({
      id: 'sub_paid',
      status: 'active',
    })

    const result = await grantComplimentaryPremium(supabase, {
      userId: 'user-2',
      email: 'paying@example.com',
    })

    expect(result.status).toBe('already_subscribed')
    expect(stripeMock.subscriptions.create).not.toHaveBeenCalled()
    expect(supabase._updates).toHaveLength(0)
  })

  it('grants when the stored subscription is cancelled', async () => {
    const supabase = makeFakeSupabase({
      stripe_customer_id: 'cus_lapsed',
      stripe_subscription_id: 'sub_old',
      full_name: null,
    })
    stripeMock.subscriptions.retrieve.mockResolvedValue({
      id: 'sub_old',
      status: 'canceled',
    })
    stripeMock.customers.retrieve.mockResolvedValue({ id: 'cus_lapsed' })
    stripeMock.subscriptions.create.mockResolvedValue({
      id: 'sub_new',
      status: 'trialing',
    })

    const result = await grantComplimentaryPremium(supabase, {
      userId: 'user-3',
      email: 'lapsed@example.com',
    })

    expect(result.status).toBe('granted')
    expect(stripeMock.subscriptions.create).toHaveBeenCalled()
  })

  it('creates a Stripe customer when the profile has none', async () => {
    const supabase = makeFakeSupabase({
      stripe_customer_id: null,
      stripe_subscription_id: null,
      full_name: 'New User',
    })
    stripeMock.customers.create.mockResolvedValue({ id: 'cus_new' })
    stripeMock.subscriptions.create.mockResolvedValue({
      id: 'sub_new',
      status: 'trialing',
    })

    const result = await grantComplimentaryPremium(supabase, {
      userId: 'user-4',
      email: 'new@example.com',
    })

    expect(result.status).toBe('granted')
    expect(stripeMock.customers.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'new@example.com',
        metadata: { supabase_user_id: 'user-4' },
      }),
    )
    expect(supabase._updates).toContainEqual({ stripe_customer_id: 'cus_new' })
  })

  it('refuses to report success when the profile row does not exist', async () => {
    // Every profile write is an .eq('id', ...) update, which reports no error
    // when it matches zero rows — so a missing profile must stop the grant,
    // not produce a Stripe subscription and a false "granted".
    const supabase = makeFakeSupabase(null)

    const result = await grantComplimentaryPremium(supabase, {
      userId: 'ghost-user',
      email: 'ghost@example.com',
    })

    expect(result.status).toBe('failed')
    expect(result.error).toContain('No profile row found')
    expect(stripeMock.subscriptions.create).not.toHaveBeenCalled()
    expect(stripeMock.customers.create).not.toHaveBeenCalled()
  })

  it('reports failure instead of throwing when Stripe errors', async () => {
    const supabase = makeFakeSupabase({
      stripe_customer_id: 'cus_x',
      stripe_subscription_id: null,
      full_name: null,
    })
    stripeMock.customers.retrieve.mockResolvedValue({ id: 'cus_x' })
    stripeMock.subscriptions.create.mockRejectedValue(new Error('Stripe is down'))

    const result = await grantComplimentaryPremium(supabase, {
      userId: 'user-5',
      email: 'unlucky@example.com',
    })

    // The invite email is already sent and cannot be recalled — this must
    // resolve to a recordable result, never throw.
    expect(result.status).toBe('failed')
    expect(result.error).toContain('Stripe is down')
  })
})
