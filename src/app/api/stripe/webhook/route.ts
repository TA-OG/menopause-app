import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-04-10',
})

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

  // Log the event
  await admin.from('payment_events').insert({
    stripe_event_id: event.id,
    event_type: event.type,
    data: event.data.object as unknown as Record<string, unknown>,
  }).then(({ error }) => {
    if (error) console.error('Failed to log payment event:', error)
  })

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session

      if (session.subscription) {
        // Retrieve subscription directly to get reliable metadata
        const subscription = await stripe.subscriptions.retrieve(
          session.subscription as string
        )
        const userId = subscription.metadata?.supabase_user_id
          ?? session.metadata?.supabase_user_id

        if (userId) {
          await admin
            .from('profiles')
            .update({
              subscription_tier: 'premium',
              subscription_status: 'active',
              stripe_subscription_id: session.subscription as string,
            })
            .eq('id', userId)
        }
      }
      break
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription
      const userId = sub.metadata?.supabase_user_id

      if (userId) {
        const isActive = sub.status === 'active' || sub.status === 'trialing'
        await admin
          .from('profiles')
          .update({
            subscription_tier: isActive ? 'premium' : 'free',
            subscription_status: sub.status as any,
          })
          .eq('id', userId)
      }
      break
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const userId = sub.metadata?.supabase_user_id

      if (userId) {
        await admin
          .from('profiles')
          .update({
            subscription_tier: 'free',
            subscription_status: 'cancelled',
            stripe_subscription_id: null,
          })
          .eq('id', userId)
      }
      break
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      const sub = invoice.subscription

      if (sub) {
        const subscription = await stripe.subscriptions.retrieve(sub as string)
        const userId = subscription.metadata?.supabase_user_id

        if (userId) {
          await admin
            .from('profiles')
            .update({ subscription_status: 'past_due' })
            .eq('id', userId)
        }
      }
      break
    }

    default:
      // Unhandled event — logged above, nothing to do
      break
  }

  return NextResponse.json({ received: true })
}
