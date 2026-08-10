import Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { qualifyReferral } from '@/lib/referral-rewards'
import { mapStripeStatusToDb, isEntitledStripeStatus, type DbSubscriptionStatus } from '@/lib/stripe-status'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-04-10',
})

export interface SyncResult {
  tier: 'free' | 'premium'
  status: DbSubscriptionStatus | null
  /** True if a live Stripe subscription was found and the profile was written. */
  synced: boolean
}

/**
 * Re-derive a user's subscription_tier/status directly from Stripe rather
 * than trusting whatever the webhook has (or hasn't) recorded. This is the
 * self-heal path for the exact failure mode the webhook is normally
 * vulnerable to: a missed, delayed, or failed webhook delivery leaving a
 * paying customer stuck on the free tier with no way to recover short of a
 * manual DB fix. Safe to call any time — read-only against Stripe, and the
 * profile write mirrors exactly what the webhook itself would have written.
 *
 * Must be called with an admin (service-role) client — subscription_tier /
 * subscription_status / stripe_subscription_id are protected columns that a
 * user-scoped client can no longer write directly (see migration 023).
 */
export async function syncSubscriptionFromStripe(
  admin: SupabaseClient,
  userId: string
): Promise<SyncResult> {
  const { data: profile } = await admin
    .from('profiles')
    .select('stripe_customer_id, subscription_tier, subscription_status')
    .eq('id', userId)
    .single()

  const fallback: SyncResult = {
    tier: (profile?.subscription_tier as 'free' | 'premium') ?? 'free',
    status: (profile?.subscription_status as DbSubscriptionStatus) ?? null,
    synced: false,
  }

  if (!profile?.stripe_customer_id) return fallback

  const subscriptions = await stripe.subscriptions.list({
    customer: profile.stripe_customer_id,
    status: 'all',
    limit: 10,
  })

  if (subscriptions.data.length === 0) return fallback

  // Prefer a currently-live subscription; otherwise fall back to the most
  // recently created one (e.g. to correctly reflect a cancellation).
  const live = subscriptions.data.find((s) => isEntitledStripeStatus(s.status))
  const chosen = live ?? [...subscriptions.data].sort((a, b) => b.created - a.created)[0]

  const isActive = isEntitledStripeStatus(chosen.status)
  const tier: 'free' | 'premium' = isActive ? 'premium' : 'free'
  const status = mapStripeStatusToDb(chosen.status)

  const { error } = await admin
    .from('profiles')
    .update({
      subscription_tier: tier,
      subscription_status: status,
      stripe_subscription_id: chosen.id,
    })
    .eq('id', userId)

  if (error) {
    console.error('syncSubscriptionFromStripe: profile update failed', error)
    return fallback
  }

  if (isActive) await qualifyReferral(admin, userId)

  return { tier, status, synced: true }
}
