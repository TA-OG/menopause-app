import type Stripe from 'stripe'

/** Matches the `subscription_status` Postgres enum in 001_initial_schema.sql. */
export type DbSubscriptionStatus = 'active' | 'cancelled' | 'past_due' | 'trialing'

/**
 * Map a Stripe subscription status onto our DB enum. These are NOT the same
 * set of values — notably Stripe uses `canceled` (one L) while our enum uses
 * `cancelled` (two Ls), and Stripe has several statuses (`unpaid`,
 * `incomplete`, `incomplete_expired`, `paused`) with no direct equivalent.
 * Writing a raw Stripe status straight into the enum column throws a
 * Postgres error for any of those — this mapping is what prevents that.
 */
export function mapStripeStatusToDb(status: Stripe.Subscription.Status): DbSubscriptionStatus {
  switch (status) {
    case 'active':
      return 'active'
    case 'trialing':
      return 'trialing'
    case 'past_due':
      return 'past_due'
    case 'incomplete':
      // Checkout started but no successful charge yet — not entitled, but
      // distinct from a firm cancellation; closest existing bucket.
      return 'past_due'
    case 'canceled':
    case 'incomplete_expired':
    case 'unpaid':
    case 'paused':
    default:
      return 'cancelled'
  }
}

export function isEntitledStripeStatus(status: Stripe.Subscription.Status): boolean {
  return status === 'active' || status === 'trialing'
}
