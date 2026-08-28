import Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { mapStripeStatusToDb, isEntitledStripeStatus } from '@/lib/stripe-status'
import {
  COMPLIMENTARY_PREMIUM_MONTHS,
  PENDING_ACTIVATION,
} from '@/lib/complimentary-premium-config'
import type {
  ComplimentaryGrantStatus,
  ComplimentaryRecordStatus,
  InviteKind,
} from '@/lib/complimentary-premium-config'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-04-10',
})

// The policy constants and status types live in a Stripe-free module so the
// admin UI can import the same values this file acts on, rather than restating
// them. Re-exported here so every existing import from this module keeps
// working — callers do not need to know which of the two files a name is in.
export {
  COMPLIMENTARY_PREMIUM_MONTHS,
  PENDING_ACTIVATION,
} from '@/lib/complimentary-premium-config'

export type {
  ComplimentaryGrantStatus,
  ComplimentaryRecordStatus,
  ComplimentaryStatus,
  InviteKind,
} from '@/lib/complimentary-premium-config'

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
 * Render an unknown thrown value as a message a human can act on.
 *
 * Supabase returns PostgrestError as a plain object rather than an Error, so
 * `String(err)` on one yields "[object Object]". That string is what gets
 * written to admin_invites.error — the only place an admin can find out why
 * someone did not receive the premium they were promised — so it has to carry
 * the actual reason.
 */
function describeError(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err

  if (err && typeof err === 'object') {
    const e = err as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown }
    const parts = [e.message, e.details, e.hint].filter(
      (part): part is string => typeof part === 'string' && part.length > 0,
    )
    if (parts.length > 0) {
      const detail = parts.join(' — ')
      return e.code ? `${detail} (${String(e.code)})` : detail
    }
    try {
      return JSON.stringify(err)
    } catch {
      // Circular or otherwise unserialisable — fall through to String().
    }
  }

  return String(err)
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
    const message = describeError(err)
    console.error(
      `grantComplimentaryPremium: failed for user ${params.userId} (${params.email}):`,
      message,
    )
    return failed(message)
  }
}

/**
 * Run any complimentary premium grant that is waiting on this user's first
 * sign-in, and record the outcome on their admin_invites row.
 *
 * The clock deliberately starts here rather than at invite time: granting on
 * invite began the 12 months before the woman had an account she could use, so
 * someone who accepted three months later received nine months of real access.
 * It also created a Stripe customer and subscription for every invitee,
 * including those who never accepted.
 *
 * Safe to call on every login, and intended to be — exactly like claimReferral
 * alongside it in the auth callback. It is a no-op when there is no pending
 * invite, which is the case for every sign-in after the first.
 *
 * Concurrency: the pending_activation -> activating move is a conditional
 * UPDATE, so of two simultaneous sign-ins only one claims the row. Stripe's
 * idempotency key on the subscription create is a second line of defence.
 *
 * Never throws. A failure here must not break the user's sign-in — they are
 * standing at the door of a health app, and a Stripe outage is not a reason to
 * keep them out. The failure is recorded on the invite row instead, where the
 * dashboard surfaces it for follow-up.
 *
 * Requires a service-role client.
 */
export async function activatePendingComplimentaryPremium(
  admin: SupabaseClient,
  userId: string,
  email: string,
): Promise<ComplimentaryGrantResult | null> {
  try {
    // Oldest pending row first, and read as a list rather than with
    // .maybeSingle(). maybeSingle() *errors* when more than one row matches,
    // and duplicates are possible: re-inviting the same person before this
    // guard existed wrote a second pending row. Under maybeSingle() that
    // turned into "no pending invite" and the woman silently never received
    // the premium she was promised. Taking the first row instead means a
    // duplicate is harmless — the extra row is claimed at a later sign-in,
    // where grantComplimentaryPremium sees the live complimentary
    // subscription and records 'already_subscribed' rather than granting
    // twice.
    const { data: pendingRows } = await admin
      .from('admin_invites')
      .select('id, complimentary_months')
      .eq('user_id', userId)
      .eq('complimentary_status', PENDING_ACTIVATION)
      .order('created_at', { ascending: true })
      .limit(1)

    const pending = pendingRows?.[0]
    if (!pending) return null

    // Claim the row. The .eq on the current status makes this the atomic
    // gate: a second concurrent sign-in matches zero rows and backs off.
    const { data: claimed } = await admin
      .from('admin_invites')
      .update({ complimentary_status: 'activating' })
      .eq('id', pending.id)
      .eq('complimentary_status', PENDING_ACTIVATION)
      .select('id')
      .maybeSingle()

    if (!claimed) return null

    const result = await grantComplimentaryPremium(admin, {
      userId,
      email,
      months: pending.complimentary_months ?? COMPLIMENTARY_PREMIUM_MONTHS,
    })

    const { error: logError } = await admin
      .from('admin_invites')
      .update({
        complimentary_status: result.status,
        complimentary_months: result.months,
        complimentary_expires_at: result.expiresAt,
        stripe_subscription_id: result.stripeSubscriptionId,
        error: result.error,
        activated_at: new Date().toISOString(),
      })
      .eq('id', pending.id)

    if (logError) {
      // The grant itself may well have succeeded; only the bookkeeping
      // failed. Log loudly rather than misreporting either way.
      console.error(
        `activatePendingComplimentaryPremium: grant recorded as "${result.status}" for user ${userId}, but the admin_invites row could not be updated`,
        logError,
      )
    }

    return result
  } catch (err) {
    console.error(
      `activatePendingComplimentaryPremium: unexpected failure for user ${userId}:`,
      describeError(err),
    )
    return null
  }
}

export interface ScheduleComplimentaryResult {
  status: ComplimentaryRecordStatus
  months: number
  expiresAt: string | null
  stripeSubscriptionId: string | null
  error: string | null
  /** True when the grant ran now; false when it waits for first sign-in. */
  activatedNow: boolean
}

/**
 * Attach COMPLIMENTARY_PREMIUM_MONTHS of premium to an invite and write the
 * admin_invites audit row for it.
 *
 * Two timings, and which one applies is decided by whether the person can
 * actually use the app yet:
 *
 *   - Never signed in (a fresh invite, or one still unaccepted) — the grant is
 *     recorded as 'pending_activation' and runs at their first sign-in via
 *     activatePendingComplimentaryPremium. This is the rule migration 032
 *     established: the 12 months must mean twelve months of *usable* access,
 *     and no Stripe object should exist for an invite nobody accepted.
 *
 *   - Already signed in at least once — the same reasoning inverts. They can
 *     use the app right now, so deferring would leave a live user sitting
 *     behind the paywall until they happened to sign out and back in. The
 *     grant runs immediately and the row records its real outcome.
 *
 * Duplicate guard: a user with a grant already awaiting activation gets no
 * second pending row. activatePendingComplimentaryPremium looks its pending
 * row up with .maybeSingle(), which errors when two rows match — so a second
 * pending row would not double-grant, it would stop the person being granted
 * anything at all. The new invite is still logged, as 'not_attempted' with the
 * reason, so the audit trail stays complete.
 *
 * Never throws. The invite email is sent before this runs and cannot be
 * recalled, so every failure has to end up recorded rather than raised.
 *
 * Requires a service-role client.
 */
export async function scheduleComplimentaryPremium(
  admin: SupabaseClient,
  params: {
    userId: string
    email: string
    firstName?: string | null
    invitedBy?: string | null
    inviteKind: InviteKind
    waitlistId?: string | null
    /** True when the account already existed, so no invite email was sent. */
    alreadyRegistered?: boolean
    /** True when that account has signed in at least once. */
    hasSignedIn?: boolean
    months?: number
  },
): Promise<ScheduleComplimentaryResult> {
  const months = params.months ?? COMPLIMENTARY_PREMIUM_MONTHS

  let result: ScheduleComplimentaryResult = {
    status: PENDING_ACTIVATION,
    months,
    expiresAt: null,
    stripeSubscriptionId: null,
    error: null,
    activatedNow: false,
  }

  try {
    const { data: awaiting, error: awaitingError } = await admin
      .from('admin_invites')
      .select('id')
      .eq('user_id', params.userId)
      .in('complimentary_status', [PENDING_ACTIVATION, 'activating'])
      .limit(1)

    // A lookup failure must not silently become "no pending row" — that is
    // precisely the case the guard exists to prevent.
    if (awaitingError) throw awaitingError

    if ((awaiting ?? []).length > 0) {
      result = {
        ...result,
        status: 'not_attempted',
        error:
          'Complimentary premium was already scheduled by an earlier invite — it starts when they first sign in. No second grant was created.',
      }
    } else if (params.hasSignedIn) {
      // fullName is deliberately not passed: params.firstName is a first name
      // only, and handing it to Stripe would overwrite the customer's real
      // full name. grantComplimentaryPremium falls back to profiles.full_name.
      const granted = await grantComplimentaryPremium(admin, {
        userId: params.userId,
        email: params.email,
        grantedBy: params.invitedBy ?? null,
        months,
      })
      result = {
        status: granted.status,
        months: granted.months,
        expiresAt: granted.expiresAt,
        stripeSubscriptionId: granted.stripeSubscriptionId,
        error: granted.error,
        activatedNow: granted.status === 'granted',
      }
    }
  } catch (err) {
    const message = describeError(err)
    console.error(
      `scheduleComplimentaryPremium: failed for user ${params.userId} (${params.email}):`,
      message,
    )
    result = {
      ...result,
      status: 'failed',
      expiresAt: null,
      stripeSubscriptionId: null,
      error: message,
      activatedNow: false,
    }
  }

  // Written last so it reflects what actually happened. Its own try/catch,
  // because a grant that succeeded must not be reported as a failure just
  // because the bookkeeping write did not land — and this function must never
  // throw: by the time it runs the invite email has already gone out.
  try {
    const { error: logError } = await admin.from('admin_invites').insert({
      email: params.email,
      first_name: params.firstName ?? null,
      waitlist_id: params.waitlistId ?? null,
      user_id: params.userId,
      invited_by: params.invitedBy ?? null,
      invite_kind: params.inviteKind,
      already_registered: params.alreadyRegistered ?? false,
      complimentary_status: result.status,
      complimentary_months: result.months,
      complimentary_expires_at: result.expiresAt,
      stripe_subscription_id: result.stripeSubscriptionId,
      error: result.error,
      activated_at: result.activatedNow ? new Date().toISOString() : null,
    })
    if (logError) throw logError
  } catch (err) {
    console.error(
      `scheduleComplimentaryPremium: outcome "${result.status}" for user ${params.userId}, but the admin_invites row could not be written:`,
      describeError(err),
    )
  }

  return result
}
