import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { qualifyReferral, consumeBankedMonths } from '@/lib/referral-rewards'
import { mapStripeStatusToDb, isEntitledStripeStatus } from '@/lib/stripe-status'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-04-10',
})

/**
 * Resolve the Supabase user a Stripe object belongs to. Metadata is set on
 * every subscription/customer created through create-checkout/route.ts, but
 * falls back to matching profiles.stripe_customer_id in case metadata is
 * ever missing (e.g. a subscription created outside the normal checkout
 * flow). Without this fallback a missing-metadata event silently drops the
 * update with no way to recover it.
 */
async function resolveUserId(
  admin: SupabaseClient,
  metadataUserId: string | null | undefined,
  customerId: string | null | undefined
): Promise<string | null> {
  if (metadataUserId) return metadataUserId
  if (!customerId) return null

  const { data } = await admin
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single()

  return data?.id ?? null
}

export async function POST(request: NextRequest) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')!

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Claim this event for processing. stripe_event_id has a UNIQUE
  // constraint, so a concurrent/duplicate delivery fails to insert here.
  const { error: insertError } = await admin.from('payment_events').insert({
    stripe_event_id: event.id,
    event_type: event.type,
    data: event.data.object as unknown as Record<string, unknown>,
    status: 'processing',
  })

  if (insertError) {
    if (insertError.code === '23505') {
      // We've seen this event id before. Only skip it if the PREVIOUS
      // attempt actually finished — otherwise this is Stripe correctly
      // retrying a delivery whose processing failed last time, and
      // dropping it here would silently strand the user on the free tier
      // even though Stripe is trying to tell us the payment succeeded.
      const { data: existing } = await admin
        .from('payment_events')
        .select('status')
        .eq('stripe_event_id', event.id)
        .single()

      if (existing?.status === 'completed') {
        return NextResponse.json({ received: true, duplicate: true })
      }
      console.warn(`Retrying previously "${existing?.status ?? 'unknown'}" event ${event.id}`)
    } else {
      // Audit-log write failed for some other reason — log it, but don't
      // let that block the actual subscription update below.
      console.error('Failed to log payment event:', insertError)
    }
  }

  try {
    let resolvedUserId: string | null = null

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session

        if (session.subscription) {
          // Retrieve subscription directly to get reliable metadata
          const subscription = await stripe.subscriptions.retrieve(
            session.subscription as string
          )
          const userId = await resolveUserId(
            admin,
            subscription.metadata?.supabase_user_id ?? session.metadata?.supabase_user_id,
            (subscription.customer as string) ?? (session.customer as string | null)
          )

          if (userId) {
            resolvedUserId = userId

            const { error } = await admin
              .from('profiles')
              .update({
                subscription_tier: 'premium',
                subscription_status: 'active',
                stripe_subscription_id: session.subscription as string,
              })
              .eq('id', userId)
            if (error) throw error

            // Redeem any banked referral months consumed as this subscription's
            // trial period, then check whether this user's own signup was a
            // referral that has now qualified (first successful payment).
            const consumedMonths = Number(subscription.metadata?.referral_trial_months_consumed ?? 0)
            if (consumedMonths > 0) {
              await consumeBankedMonths(admin, userId, consumedMonths)
            }
            await qualifyReferral(admin, userId)
          } else {
            throw new Error(
              `checkout.session.completed: could not resolve a Supabase user (no metadata.supabase_user_id, no profile matching stripe_customer_id)`
            )
          }
        }
        break
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        const userId = await resolveUserId(admin, sub.metadata?.supabase_user_id, sub.customer as string)

        if (userId) {
          resolvedUserId = userId
          const isActive = isEntitledStripeStatus(sub.status)
          const { error } = await admin
            .from('profiles')
            .update({
              subscription_tier: isActive ? 'premium' : 'free',
              subscription_status: mapStripeStatusToDb(sub.status),
            })
            .eq('id', userId)
          if (error) throw error
        } else {
          throw new Error('customer.subscription.updated: could not resolve a Supabase user')
        }
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        const userId = await resolveUserId(admin, sub.metadata?.supabase_user_id, sub.customer as string)

        if (userId) {
          resolvedUserId = userId
          const { error } = await admin
            .from('profiles')
            .update({
              subscription_tier: 'free',
              subscription_status: 'cancelled',
              stripe_subscription_id: null,
            })
            .eq('id', userId)
          if (error) throw error
        } else {
          throw new Error('customer.subscription.deleted: could not resolve a Supabase user')
        }
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const sub = invoice.subscription

        if (sub) {
          const subscription = await stripe.subscriptions.retrieve(sub as string)
          const userId = await resolveUserId(admin, subscription.metadata?.supabase_user_id, subscription.customer as string)

          if (userId) {
            resolvedUserId = userId
            const { error } = await admin
              .from('profiles')
              .update({ subscription_status: 'past_due' })
              .eq('id', userId)
            if (error) throw error
          }
        }
        break
      }

      default:
        // Unhandled event type — nothing to do, falls through to being
        // marked 'completed' below so Stripe doesn't keep retrying it.
        break
    }

    await admin
      .from('payment_events')
      .update({ status: 'completed', user_id: resolvedUserId, error: null })
      .eq('stripe_event_id', event.id)

    return NextResponse.json({ received: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`Stripe webhook processing failed for ${event.type} (${event.id}):`, message)

    await admin
      .from('payment_events')
      .update({ status: 'failed', error: message })
      .eq('stripe_event_id', event.id)

    // Non-2xx tells Stripe to retry the delivery — and next time, the
    // idempotency check above will let it actually reprocess instead of
    // being swallowed as a duplicate.
    return NextResponse.json({ error: 'Processing error' }, { status: 500 })
  }
}
