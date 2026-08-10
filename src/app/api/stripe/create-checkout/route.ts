import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Stripe from 'stripe'
import { rateLimit } from '@/lib/rate-limit'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-04-10',
})

export async function POST(request: NextRequest) {
  const { success } = rateLimit(request, { limit: 5, windowMs: 60_000 })
  if (!success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    // Fail fast with a clear message if Stripe env vars are missing
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: 'STRIPE_SECRET_KEY is not set in environment variables' }, { status: 500 })
    }

    const { currency, interval } = await request.json()
    const isUSD = currency === 'usd'
    const isYearly = interval === 'yearly'

    // Pick the correct Stripe price ID from env
    let priceEnvKey: string
    if (isUSD) {
      priceEnvKey = isYearly ? 'STRIPE_PRICE_USD_YEARLY' : 'STRIPE_PRICE_USD_MONTHLY'
    } else {
      priceEnvKey = isYearly ? 'STRIPE_PRICE_GBP_YEARLY' : 'STRIPE_PRICE_GBP_MONTHLY'
    }
    const priceId = process.env[priceEnvKey]

    if (!priceId) {
      return NextResponse.json({ error: `Stripe price ID not configured (${priceEnvKey})` }, { status: 500 })
    }

    if (!process.env.NEXT_PUBLIC_APP_URL) {
      return NextResponse.json({ error: 'NEXT_PUBLIC_APP_URL is not set in environment variables' }, { status: 500 })
    }

    // Get or create Stripe customer
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id, full_name, referral_months_banked')
      .eq('id', user.id)
      .single()

    // Banked referral months (earned before this user had a subscription to
    // extend directly) are redeemed now as a trial period on the new
    // subscription. Consumed exactly once the subscription is confirmed —
    // see the referral_trial_months_consumed handling in the Stripe webhook.
    const bankedMonths = profile?.referral_months_banked ?? 0

    let customerId = profile?.stripe_customer_id

    // If we have a stored customer ID, verify it still exists in the current
    // Stripe account. A stored ID can become stale if:
    //   - The Stripe account/key was rotated to a different account
    //   - The customer was manually deleted in the Stripe dashboard
    // In those cases, treat it as if there's no customer and create a fresh one.
    if (customerId) {
      try {
        const existing = await stripe.customers.retrieve(customerId)
        if ((existing as any).deleted) {
          customerId = null  // Stripe returns a deleted-customer stub — fall through to create
        }
      } catch (err: any) {
        if (err?.code === 'resource_missing') {
          console.warn(`Stale stripe_customer_id ${customerId} for user ${user.id} — creating new`)
          customerId = null
        } else {
          throw err  // Real error — let the outer catch handle it
        }
      }
    }

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email!,
        name: profile?.full_name ?? undefined,
        metadata: { supabase_user_id: user.id },
      })
      customerId = customer.id

      // stripe_customer_id is a protected column (see migration 023) — the
      // user-scoped client can't write it even for their own row, so this
      // trusted server-side write goes through the admin client instead.
      const admin = createAdminClient()
      await admin
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id)
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL!

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId as string, quantity: 1 }],
      success_url: `${appUrl}/dashboard?upgraded=true`,
      cancel_url: `${appUrl}/pay`,
      subscription_data: {
        metadata: {
          supabase_user_id: user.id,
          ...(bankedMonths > 0 ? { referral_trial_months_consumed: String(bankedMonths) } : {}),
        },
        ...(bankedMonths > 0 ? { trial_period_days: bankedMonths * 30 } : {}),
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    const msg = (err as any)?.message ?? 'Something went wrong'
    console.error('Stripe checkout error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
