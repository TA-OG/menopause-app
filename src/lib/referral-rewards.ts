import Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { generateReferralCode, isValidReferralCode } from '@/lib/referral'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-04-10',
})

/** Months granted per qualifying referral, to both the referrer and the referred friend. */
export const REFERRAL_REWARD_MONTHS = 1

/** Lifetime cap on stacked free months a single referrer can earn via referrals. */
export const REFERRAL_CAP_MONTHS = 6

const SECONDS_PER_MONTH = 30 * 24 * 60 * 60

/**
 * Build the shareable in-app referral link (distinct from the pre-launch
 * waitlist referral link in lib/referral.ts, which points at /waitlist).
 */
export function buildAppReferralUrl(referralCode: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://auntymel.app'
  return `${baseUrl}/auth/sign-up?ref=${referralCode}`
}

/**
 * Return the user's referral code, generating and persisting one on first
 * use. Safe to call with a user-scoped client — profiles RLS allows a user
 * to update their own row.
 */
export async function getOrCreateReferralCode(
  supabase: SupabaseClient,
  userId: string,
  firstName?: string | null
): Promise<string> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('referral_code')
    .eq('id', userId)
    .single()

  if (profile?.referral_code) return profile.referral_code

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode(firstName ?? 'YOU')
    const { data, error } = await supabase
      .from('profiles')
      .update({ referral_code: code })
      .eq('id', userId)
      .select('referral_code')
      .single()

    if (!error && data) return data.referral_code
  }

  throw new Error('Failed to generate a unique referral code')
}

/**
 * Record that `referredUserId` signed up using `rawCode`. No-ops silently
 * on an invalid/unknown code, a self-referral attempt, or if this user has
 * already been claimed as someone's referred friend (referred_id is UNIQUE,
 * so re-running this — e.g. on every login redirect — is always safe).
 */
export async function claimReferral(
  admin: SupabaseClient,
  referredUserId: string,
  rawCode: string | null | undefined
): Promise<void> {
  if (!rawCode) return
  const code = rawCode.trim().toUpperCase()
  if (!isValidReferralCode(code)) return

  const { data: referrer } = await admin
    .from('profiles')
    .select('id')
    .eq('referral_code', code)
    .single()

  if (!referrer || referrer.id === referredUserId) return

  const { error } = await admin.from('referrals').insert({
    referrer_id: referrer.id,
    referred_id: referredUserId,
    referral_code_used: code,
  })

  // 23505 = unique_violation — this user was already someone's referred
  // friend. That's the expected, silent outcome, not an error to surface.
  if (error && error.code !== '23505') {
    console.error('claimReferral: failed to record referral', error)
  }
}

/**
 * Called when a user's subscription first becomes active (their first
 * successful payment). Idempotent: the pending → qualified transition only
 * ever succeeds once per referral, so calling this repeatedly (Stripe
 * webhook retries, re-subscriptions) is safe.
 */
export async function qualifyReferral(
  admin: SupabaseClient,
  referredUserId: string
): Promise<void> {
  const { data: referral, error } = await admin
    .from('referrals')
    .update({ status: 'qualified', qualified_at: new Date().toISOString() })
    .eq('referred_id', referredUserId)
    .eq('status', 'pending')
    .select('id, referrer_id, referred_id')
    .single()

  if (error || !referral) return // nothing pending for this user — no-op

  // The referred friend's own bonus is a one-off and is never capped.
  await grantReward(admin, referral.id, referral.referred_id, 'referred', REFERRAL_REWARD_MONTHS)

  // The referrer's reward stacks, up to the lifetime cap.
  const { data: priorRewards } = await admin
    .from('referral_rewards')
    .select('months')
    .eq('user_id', referral.referrer_id)
    .eq('role', 'referrer')
    .in('status', ['pending', 'applied'])

  const monthsAlreadyEarned = (priorRewards ?? []).reduce((sum, r) => sum + r.months, 0)
  const monthsRemaining = REFERRAL_CAP_MONTHS - monthsAlreadyEarned

  if (monthsRemaining > 0) {
    await grantReward(
      admin,
      referral.id,
      referral.referrer_id,
      'referrer',
      Math.min(REFERRAL_REWARD_MONTHS, monthsRemaining)
    )
  }
}

async function grantReward(
  admin: SupabaseClient,
  referralId: string,
  userId: string,
  role: 'referrer' | 'referred',
  months: number
): Promise<void> {
  // The (referral_id, role) unique constraint makes this idempotent —
  // a duplicate grant attempt (e.g. webhook retry) just no-ops here.
  const { data: reward, error } = await admin
    .from('referral_rewards')
    .insert({ referral_id: referralId, user_id: userId, role, months })
    .select('id')
    .single()

  if (error) {
    if (error.code !== '23505') console.error('grantReward: insert failed', error)
    return
  }

  await applyReward(admin, reward.id, userId, months)
}

/**
 * Apply a granted reward. If the user has a live Stripe subscription, we
 * push its next invoice out by `months` using Stripe's trial_end mechanism
 * — this works regardless of where they currently are in their billing
 * cycle (mid-cycle, just renewed, already trialing) because it's additive
 * on top of their current paid-through/trial date, not a replacement of it.
 * If they have no subscription yet, the months are banked on their profile
 * and consumed as a trial period on their next checkout.
 *
 * Important: this function never sets profiles.subscription_tier/status
 * itself. A user with no subscription only gets a banked credit — actual
 * premium access still requires them to complete a real Stripe Checkout
 * (which always collects a card, see payment_method_collection: 'always'
 * in create-checkout) and only ever gets flipped on by the Stripe webhook.
 * A referral can make a month free; it can never skip requiring a card.
 */
async function applyReward(
  admin: SupabaseClient,
  rewardId: string,
  userId: string,
  months: number
): Promise<void> {
  const { data: profile } = await admin
    .from('profiles')
    .select('stripe_subscription_id, subscription_status')
    .eq('id', userId)
    .single()

  try {
    if (profile?.stripe_subscription_id && profile.subscription_status !== 'cancelled') {
      const subscription = await stripe.subscriptions.retrieve(profile.stripe_subscription_id)
      const now = Math.floor(Date.now() / 1000)
      const currentTrialEnd = subscription.trial_end && subscription.trial_end > now
        ? subscription.trial_end
        : null
      const base = currentTrialEnd ?? subscription.current_period_end ?? now
      const newTrialEnd = base + months * SECONDS_PER_MONTH

      await stripe.subscriptions.update(subscription.id, {
        trial_end: newTrialEnd,
        proration_behavior: 'none',
      })

      await admin
        .from('referral_rewards')
        .update({
          status: 'applied',
          application_method: 'stripe_trial_extension',
          applied_at: new Date().toISOString(),
        })
        .eq('id', rewardId)
    } else {
      const { error } = await admin.rpc('increment_referral_months_banked', {
        p_user_id: userId,
        p_months: months,
      })
      if (error) throw error

      await admin
        .from('referral_rewards')
        .update({
          status: 'applied',
          application_method: 'banked_credit',
          applied_at: new Date().toISOString(),
        })
        .eq('id', rewardId)
    }
  } catch (err) {
    console.error(`applyReward: failed for reward ${rewardId}, user ${userId}`, err)
    await admin.from('referral_rewards').update({ status: 'failed' }).eq('id', rewardId)
  }
}

/**
 * Consume banked referral months for a fresh Stripe checkout, decrementing
 * the exact amount that was applied to that checkout session (not a blind
 * reset to zero, so credit earned mid-checkout isn't silently dropped).
 */
export async function consumeBankedMonths(
  admin: SupabaseClient,
  userId: string,
  months: number
): Promise<void> {
  if (months <= 0) return
  const { error } = await admin.rpc('decrement_referral_months_banked', {
    p_user_id: userId,
    p_months: months,
  })
  if (error) console.error('consumeBankedMonths: failed', error)
}
