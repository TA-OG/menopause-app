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
  activatePendingComplimentaryPremium,
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

/**
 * Table-aware fake covering both tables the activation path touches, with the
 * chained shapes it actually uses:
 *   admin_invites: select().eq().eq().maybeSingle()
 *                  update().eq().eq().select().maybeSingle()   (the claim)
 *                  update().eq()                               (final write)
 *   profiles:      select().eq().maybeSingle()
 *                  update().eq()
 */
function makeFakeSupabaseWithInvites(opts: {
  profile: Record<string, unknown> | null
  invite: Record<string, unknown> | null
}) {
  const invite = opts.invite ? { ...opts.invite } : null
  const inviteUpdates: Record<string, unknown>[] = []
  const profileUpdates: Record<string, unknown>[] = []

  function inviteUpdateBuilder(patch: Record<string, unknown>) {
    const filters: Record<string, unknown> = {}

    // Applies the patch only if every .eq() filter matches — this is what
    // makes the conditional claim testable.
    const apply = (): boolean => {
      if (!invite) return false
      const matches = Object.entries(filters).every(([col, val]) => invite[col] === val)
      if (!matches) return false
      Object.assign(invite, patch)
      inviteUpdates.push(patch)
      return true
    }

    const builder = {
      eq(col: string, val: unknown) {
        filters[col] = val
        return builder
      },
      select() {
        return {
          maybeSingle: async () => ({
            data: apply() ? { id: invite!.id } : null,
            error: null,
          }),
        }
      },
      // Awaited directly for the final write, with no .select().
      then(resolve: (v: { error: null }) => void) {
        apply()
        resolve({ error: null })
      },
    }
    return builder
  }

  const client = {
    from: (table: string) => {
      if (table === 'admin_invites') {
        return {
          select: () => {
            const filters: Record<string, unknown> = {}
            const chain = {
              eq(col: string, val: unknown) {
                filters[col] = val
                return chain
              },
              maybeSingle: async () => {
                const matches =
                  invite && Object.entries(filters).every(([c, v]) => invite[c] === v)
                return { data: matches ? invite : null, error: null }
              },
            }
            return chain
          },
          update: inviteUpdateBuilder,
        }
      }

      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: opts.profile, error: null }) }),
        }),
        update: (patch: Record<string, unknown>) => {
          profileUpdates.push(patch)
          return { eq: async () => ({ error: null }) }
        },
      }
    },
    _invite: () => invite,
    _inviteUpdates: inviteUpdates,
    _profileUpdates: profileUpdates,
  }

  return client as unknown as Parameters<typeof activatePendingComplimentaryPremium>[0] & {
    _invite: () => Record<string, unknown> | null
    _inviteUpdates: Record<string, unknown>[]
    _profileUpdates: Record<string, unknown>[]
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

describe('activatePendingComplimentaryPremium', () => {
  it('grants on first sign-in and stamps the invite row', async () => {
    const supabase = makeFakeSupabaseWithInvites({
      profile: { stripe_customer_id: null, stripe_subscription_id: null, full_name: 'Invitee' },
      invite: {
        id: 'invite-1',
        user_id: 'user-1',
        complimentary_status: 'pending_activation',
        complimentary_months: 12,
      },
    })
    stripeMock.customers.create.mockResolvedValue({ id: 'cus_new' })
    stripeMock.subscriptions.create.mockResolvedValue({ id: 'sub_new', status: 'trialing' })

    const result = await activatePendingComplimentaryPremium(
      supabase,
      'user-1',
      'invitee@example.com',
    )

    expect(result?.status).toBe('granted')

    // The clock must start now, at sign-in — roughly 12 months out, not from
    // whenever the invite happened to be sent.
    const trialEnd = stripeMock.subscriptions.create.mock.calls[0][0].trial_end * 1000
    const expected = addMonths(new Date(), 12).getTime()
    expect(Math.abs(trialEnd - expected)).toBeLessThan(60_000)

    const invite = supabase._invite()!
    expect(invite.complimentary_status).toBe('granted')
    expect(invite.activated_at).toBeTruthy()
    expect(invite.complimentary_expires_at).toBeTruthy()
  })

  it('is a no-op when the user has no pending invite', async () => {
    const supabase = makeFakeSupabaseWithInvites({
      profile: { stripe_customer_id: null, stripe_subscription_id: null, full_name: null },
      invite: null,
    })

    const result = await activatePendingComplimentaryPremium(
      supabase,
      'user-nobody',
      'nobody@example.com',
    )

    // Runs on every login, so the common case must cost nothing.
    expect(result).toBeNull()
    expect(stripeMock.subscriptions.create).not.toHaveBeenCalled()
  })

  it('does not re-grant an invite that was already activated', async () => {
    const supabase = makeFakeSupabaseWithInvites({
      profile: { stripe_customer_id: 'cus_x', stripe_subscription_id: 'sub_x', full_name: null },
      invite: {
        id: 'invite-2',
        user_id: 'user-2',
        complimentary_status: 'granted',
        complimentary_months: 12,
      },
    })

    const result = await activatePendingComplimentaryPremium(
      supabase,
      'user-2',
      'again@example.com',
    )

    expect(result).toBeNull()
    expect(stripeMock.subscriptions.create).not.toHaveBeenCalled()
  })

  it('records a failed grant on the invite row rather than throwing', async () => {
    const supabase = makeFakeSupabaseWithInvites({
      profile: { stripe_customer_id: 'cus_y', stripe_subscription_id: null, full_name: null },
      invite: {
        id: 'invite-3',
        user_id: 'user-3',
        complimentary_status: 'pending_activation',
        complimentary_months: 12,
      },
    })
    stripeMock.customers.retrieve.mockResolvedValue({ id: 'cus_y' })
    stripeMock.subscriptions.create.mockRejectedValue(new Error('Stripe is down'))

    const result = await activatePendingComplimentaryPremium(
      supabase,
      'user-3',
      'unlucky@example.com',
    )

    // Sign-in must never break because of a billing problem.
    expect(result?.status).toBe('failed')
    const invite = supabase._invite()!
    expect(invite.complimentary_status).toBe('failed')
    expect(invite.error).toContain('Stripe is down')
  })
})
