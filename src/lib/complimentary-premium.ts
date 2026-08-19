import Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { mapStripeStatusToDb, isEntitledStripeStatus } from '@/lib/stripe-status'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-04-10',
})

/** Length of the complimentary premium period granted with an admin invite. */
export const COMPLIMENTARY_PREMIUM_MONTHS = 12

export type ComplimentaryGrantStatus = 'granted' | 'already_subscribed' | 'failed'

export interface ComplimentaryGrantResult {
  status: ComplimentaryGrantStatus
  months: number
  /** ISO timestamp the complimentary period ends, when one was granted. */
  expiresAt: string | null
  stripeSubscriptionId: string | null
  /** Human-readable reason, present only when status is 'failed'. */
  error: string | null
}

/**
 * Add whole calendar months to a date, clamping to the last day of the target
 * month rather than rolling over into the next one (29 Feb + 12 months is
 * 28 Feb, not 1 Mar). Works in UTC so the result never shifts with the
 * server's local timezone or a DST boundary.
 */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime())
  const dayOfMonth = result.getUTCDate()

  // Move to the 1st first, so setUTCMonth can never overflow on its own
  // (e.g. 31 Jan -> "31 Feb" -> 3 Mar) before we get to clamp it.
  result.setUTCDate(1)
  result.setUTCMonth(result.getUTCMonth() + months)

  const daysInTargetMonth = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate()

  result.setUTCDate(Math.min(dayOfMonth, daysInTargetMonth))
  return result
}

/**
 * Resolve the Stripe price the complimentary subscription is created against.
 *
 * The user is never charged for it (the whole period is a trial), but Stripe
 * still requires a price to hang the subscription off — and it determines what
 * they would roll onto if they later add a card. STRIPE_PRICE_COMPLIMENTARY
 * allows that to be a dedicated price; otherwise it falls back to the standard
 * GBP monthly price the app already sells.
 */
function resolveComplimentaryPriceId(): string | null {
  return (
    process.env.STRIPE_PRICE_COMPLIMENTARY ??
    process.env.STRIPE_PRICE_GBP_MONTHLY ??
    null
  )
}

/**
 * Grant a user a complimentary premium account for `months` months.
 *
 * Implemented as a Stripe subscription whose entire period is a trial, rather
 * than by flipping profiles.subscription_tier on its own. That keeps Stripe as
 * the single source of billing truth, which the rest of this codebase depends
 * on: syncSubscriptionFromStripe() re-derives the tier from Stripe and would
 * otherwise "correct" a DB-only grant straight back to free the next time it
 * ran, silently revoking premium from someone who was promised it.
 *
 * No card is collected. If the complimentary period ends without the user
 * choosing to subscribe, the subscription cancels rather than invoicing them —
 * a gift must never turn into a bill for someone who never entered a card.
 *
 * The profile write here is deliberate and not redundant: the Stripe webhook
 * handles checkout.session.completed, customer.subscription.updated and
 * .deleted, but NOT customer.subscription.created, which is the only event a
 * directly-created subscription fires. Without this write the user would stay
 * on the free tier until some unrelated subscription event happened to arrive.
 *
 * Never throws — always resolves to a result the caller can log, because the
 * invite email has already been sent by the time this runs and cannot be
 * recalled. A failure here must be recorded, not lost.
 *
 * Requires a service-role client: subscription_tier, subscription_status,
 * stripe_customer_id and stripe_subscription_id are protected columns
 * (migration 023).
 */
export async function grantComplimentaryPremium(
  admin: SupabaseClient,
  params: {
    userId: string
    email: string
    fullName?: string | null
    /** Admin user id, recorded on the Stripe subscription for traceability. */
    grantedBy?: string | null
    months?: number
  },
): Promise<ComplimentaryGrantResult> {
  const months = params.months ?? COMPLIMENTARY_PREMIUM_MONTHS

  const failed = (error: string): ComplimentaryGrantResult => ({
    status: 'failed',
    months,
    expiresAt: null,
    stripeSubscriptionId: null,
    error,
  })

  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return failed('STRIPE_SECRET_KEY is not configured')
    }

    const priceId = resolveComplimentaryPriceId()
    if (!priceId) {
      return failed(
        'No Stripe price configured — set STRIPE_PRICE_COMPLIMENTARY or STRIPE_PRICE_GBP_MONTHLY',
      )
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('stripe_customer_id, stripe_subscription_id, full_name')
      .eq('id', params.userId)
      .maybeSingle()

    // The profile is created by the on_auth_user_created trigger, so it
    // normally exists by the time the invite call returns. If it somehow does
    // not, stop here rather than pressing on: every write below is an
    // `.eq('id', ...)` update, which reports no error when it matches zero
    // rows. Continuing would create a real Stripe subscription, report
    // "granted", and leave the user on the free tier — the exact silent
    // failure this whole flow exists to prevent.
    if (!profile) {
      return failed(
        `No profile row found for user ${params.userId} — complimentary premium was not applied. Re-invite to retry.`,
      )
    }

    // ─── Never clobber someone who is already paying ────────────────────
    // Re-inviting an existing customer must not replace their live paid
    // subscription with a comp one — that would hand them 12 free months
    // they did not ask for and detach the subscription they are paying for.
    if (profile?.stripe_subscription_id) {
      try {
        const existing = await stripe.subscriptions.retrieve(profile.stripe_subscription_id)
        if (isEntitledStripeStatus(existing.status)) {
          return {
            status: 'already_subscribed',
            months,
            expiresAt: null,
            stripeSubscriptionId: existing.id,
            error: null,
          }
        }
      } catch (err) {
        // A subscription id that no longer exists in this Stripe account
        // (key rotated, deleted in the dashboard) is stale, not a blocker —
        // fall through and grant. Any other error is real.
        if ((err as { code?: string })?.code !== 'resource_missing') throw err
        console.warn(
          `grantComplimentaryPremium: stale stripe_subscription_id ${profile.stripe_subscription_id} for user ${params.userId}`,
        )
      }
    }

    // ─── Get or create the Stripe customer ──────────────────────────────
    // Mirrors create-checkout/route.ts, including its stale-id handling.
    let customerId = profile?.stripe_customer_id ?? null

    if (customerId) {
      try {
        const existing = await stripe.customers.retrieve(customerId)
        if ((existing as { deleted?: boolean }).deleted) customerId = null
      } catch (err) {
        if ((err as { code?: string })?.code === 'resource_missing') {
          console.warn(
            `grantComplimentaryPremium: stale stripe_customer_id ${customerId} for user ${params.userId} — creating new`,
          )
          customerId = null
        } else {
          throw err
        }
      }
    }

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: params.email,
        name: params.fullName ?? profile?.full_name ?? undefined,
        metadata: { supabase_user_id: params.userId },
      })
      customerId = customer.id

      const { error: customerWriteError } = await admin
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', params.userId)
      if (customerWriteError) throw customerWriteError
    }

    // ─── Create the trial-only subscription ─────────────────────────────
    const trialEnd = addMonths(new Date(), months)

    const subscription = await stripe.subscriptions.create(
      {
        customer: customerId,
        items: [{ price: priceId }],
        trial_end: Math.floor(trialEnd.getTime() / 1000),
        trial_settings: {
          end_behavior: {
            // No card was collected, so at the end of the complimentary
            // period there is nothing to charge. Cancel cleanly instead of
            // raising an invoice against someone who never agreed to pay.
            missing_payment_method: 'cancel',
          },
        },
        metadata: {
          supabase_user_id: params.userId,
          complimentary: 'true',
          complimentary_months: String(months),
          ...(params.grantedBy ? { granted_by: params.grantedBy } : {}),
        },
      },
      {
        // A double-click on Invite must not create two subscriptions.
        idempotencyKey: `comp-premium-${params.userId}-${months}`,
      },
    )

    const { error: profileError } = await admin
      .from('profiles')
      .update({
        subscription_tier: isEntitledStripeStatus(subscription.status) ? 'premium' : 'free',
        subscription_status: mapStripeStatusToDb(subscription.status),
        stripe_subscription_id: subscription.id,
      })
      .eq('id', params.userId)

    if (profileError) throw profileError

    if (!isEntitledStripeStatus(subscription.status)) {
      return failed(
        `Stripe created the subscription as "${subscription.status}", which does not grant access`,
      )
    }

    return {
      status: 'granted',
      months,
      expiresAt: trialEnd.toISOString(),
      stripeSubscriptionId: subscription.id,
      error: null,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(
      `grantComplimentaryPremium: failed for user ${params.userId} (${params.email}):`,
      message,
    )
    return failed(message)
  }
}
