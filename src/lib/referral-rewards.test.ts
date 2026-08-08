// A dummy key so importing the module (which constructs a Stripe client at
// module scope, same pattern as lib/referral.ts) doesn't throw in tests —
// no real Stripe API calls happen in the cases covered here.
process.env.STRIPE_SECRET_KEY ??= 'sk_test_dummy'

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  buildAppReferralUrl,
  claimReferral,
  qualifyReferral,
  REFERRAL_CAP_MONTHS,
  REFERRAL_REWARD_MONTHS,
} from './referral-rewards'

// ─── Minimal fake Supabase client ──────────────────────────────────────────
// Supports exactly the chained calls referral-rewards.ts makes, backed by
// in-memory tables, so cap/idempotency logic can be exercised without a
// real database or network.

interface FakeTables {
  profiles: Record<string, any>
  referrals: any[]
  referral_rewards: any[]
}

function makeFakeSupabase(tables: FakeTables) {
  function profilesTable() {
    return {
      select: () => ({
        eq: (col: string, val: string) => ({
          single: async () => {
            const row = Object.values(tables.profiles).find((p: any) => p[col] === val)
            return row ? { data: row, error: null } : { data: null, error: { message: 'not found' } }
          },
        }),
      }),
    }
  }

  function referralsTable() {
    return {
      // update(...).eq('referred_id', x).eq('status', 'pending').select(...).single()
      update: (patch: any) => ({
        eq: (col1: string, val1: string) => ({
          eq: (col2: string, val2: string) => ({
            select: () => ({
              single: async () => {
                const row = tables.referrals.find((r) => r[col1] === val1 && r[col2] === val2)
                if (!row) return { data: null, error: { message: 'not found' } }
                Object.assign(row, patch)
                return { data: row, error: null }
              },
            }),
          }),
        }),
      }),
      // claimReferral awaits insert(...) directly (no .select() chain).
      insert: async (row: any) => {
        if (row.referrer_id === row.referred_id) {
          return { error: { code: '23514', message: 'self-referral' } }
        }
        if (tables.referrals.some((r) => r.referred_id === row.referred_id)) {
          return { error: { code: '23505', message: 'duplicate referred_id' } }
        }
        tables.referrals.push({ id: `ref_${tables.referrals.length}`, status: 'pending', ...row })
        return { error: null }
      },
    }
  }

  function referralRewardsTable() {
    return {
      select: () => ({
        eq: (col1: string, val1: string) => ({
          eq: (col2: string, val2: string) => ({
            in: async (col3: string, vals: string[]) => ({
              data: tables.referral_rewards.filter(
                (r) => r[col1] === val1 && r[col2] === val2 && vals.includes(r[col3])
              ),
              error: null,
            }),
          }),
        }),
      }),
      insert: (row: any) => ({
        select: () => ({
          single: async () => {
            if (tables.referral_rewards.some((r) => r.referral_id === row.referral_id && r.role === row.role)) {
              return { data: null, error: { code: '23505', message: 'duplicate reward' } }
            }
            const full = { id: `rwd_${tables.referral_rewards.length}`, status: 'pending', ...row }
            tables.referral_rewards.push(full)
            return { data: full, error: null }
          },
        }),
      }),
      update: (patch: any) => ({
        eq: async (_col: string, val: string) => {
          const row = tables.referral_rewards.find((r) => r.id === val)
          if (row) Object.assign(row, patch)
          return { data: row ?? null, error: null }
        },
      }),
    }
  }

  return {
    from: (table: keyof FakeTables) => {
      if (table === 'profiles') return profilesTable()
      if (table === 'referrals') return referralsTable()
      if (table === 'referral_rewards') return referralRewardsTable()
      throw new Error(`unmocked table ${table}`)
    },
    rpc: vi.fn(async () => ({ error: null })),
  } as any
}

describe('buildAppReferralUrl', () => {
  it('points at the in-app sign-up flow, not the waitlist', () => {
    const url = buildAppReferralUrl('ABC1234')
    expect(url).toContain('/auth/sign-up?ref=ABC1234')
    expect(url).not.toContain('/waitlist')
  })
})

describe('claimReferral', () => {
  let tables: FakeTables
  let admin: ReturnType<typeof makeFakeSupabase>

  beforeEach(() => {
    tables = {
      profiles: { referrer: { id: 'referrer', referral_code: 'ABC1234' } },
      referrals: [],
      referral_rewards: [],
    }
    admin = makeFakeSupabase(tables)
  })

  it('ignores an invalid code format', async () => {
    await claimReferral(admin, 'friend', 'not-a-code')
    expect(tables.referrals).toHaveLength(0)
  })

  it('ignores a self-referral attempt', async () => {
    await claimReferral(admin, 'referrer', 'ABC1234')
    expect(tables.referrals).toHaveLength(0)
  })

  it('records a valid referral once', async () => {
    await claimReferral(admin, 'friend', 'abc1234') // lower-case input, should normalise
    expect(tables.referrals).toHaveLength(1)
    expect(tables.referrals[0]).toMatchObject({ referrer_id: 'referrer', referred_id: 'friend' })
  })

  it('is a no-op if the user has already been claimed as a referred friend', async () => {
    tables.profiles.other = { id: 'other', referral_code: 'XYZ9999' }
    await claimReferral(admin, 'friend', 'ABC1234')
    await claimReferral(admin, 'friend', 'XYZ9999') // second attempt, different referrer
    expect(tables.referrals).toHaveLength(1)
    expect(tables.referrals[0].referrer_id).toBe('referrer') // unchanged
  })
})

describe('qualifyReferral — reward granting and the 6-month cap', () => {
  let tables: FakeTables
  let admin: ReturnType<typeof makeFakeSupabase>

  beforeEach(() => {
    tables = { profiles: {}, referrals: [], referral_rewards: [] }
    admin = makeFakeSupabase(tables)
  })

  it('grants one month to both referrer and referred friend on first qualification', async () => {
    tables.referrals.push({ id: 'r1', referrer_id: 'referrer', referred_id: 'friend', status: 'pending' })
    await qualifyReferral(admin, 'friend')

    expect(tables.referrals[0].status).toBe('qualified')
    const referrerReward = tables.referral_rewards.find((r) => r.role === 'referrer')
    const referredReward = tables.referral_rewards.find((r) => r.role === 'referred')
    expect(referrerReward?.months).toBe(REFERRAL_REWARD_MONTHS)
    expect(referredReward?.months).toBe(REFERRAL_REWARD_MONTHS)
  })

  it('is idempotent — calling twice (e.g. webhook retry) does not double-grant', async () => {
    tables.referrals.push({ id: 'r1', referrer_id: 'referrer', referred_id: 'friend', status: 'pending' })
    await qualifyReferral(admin, 'friend')
    await qualifyReferral(admin, 'friend')

    expect(tables.referral_rewards.filter((r) => r.role === 'referrer')).toHaveLength(1)
    expect(tables.referral_rewards.filter((r) => r.role === 'referred')).toHaveLength(1)
  })

  it('stops granting the referrer new months once the 6-month cap is reached', async () => {
    // Simulate 6 already-earned referrer months from prior referrals.
    for (let i = 0; i < REFERRAL_CAP_MONTHS; i++) {
      tables.referral_rewards.push({
        id: `prior_${i}`,
        referral_id: `prior_ref_${i}`,
        user_id: 'referrer',
        role: 'referrer',
        months: 1,
        status: 'applied',
      })
    }

    tables.referrals.push({ id: 'r_over_cap', referrer_id: 'referrer', referred_id: 'friend7', status: 'pending' })
    await qualifyReferral(admin, 'friend7')

    // The referred friend still gets their bonus — only the referrer's stacking is capped.
    const referredReward = tables.referral_rewards.find((r) => r.referral_id === 'r_over_cap' && r.role === 'referred')
    const referrerRewardForThisReferral = tables.referral_rewards.find(
      (r) => r.referral_id === 'r_over_cap' && r.role === 'referrer'
    )
    expect(referredReward?.months).toBe(REFERRAL_REWARD_MONTHS)
    expect(referrerRewardForThisReferral).toBeUndefined()

    const totalReferrerMonths = tables.referral_rewards
      .filter((r) => r.user_id === 'referrer' && r.role === 'referrer')
      .reduce((sum, r) => sum + r.months, 0)
    expect(totalReferrerMonths).toBe(REFERRAL_CAP_MONTHS)
  })

  it('is a no-op for a user with no pending referral', async () => {
    await qualifyReferral(admin, 'nobody')
    expect(tables.referral_rewards).toHaveLength(0)
  })
})
