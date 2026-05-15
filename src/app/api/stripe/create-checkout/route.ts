import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
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

    const { currency } = await request.json()
    const isUSD = currency === 'usd'

    const priceId = isUSD
      ? process.env.STRIPE_PRICE_USD_MONTHLY
      : process.env.STRIPE_PRICE_GBP_MONTHLY

    if (!priceId) {
      return NextResponse.json({ error: `Stripe price ID not set (${isUSD ? 'STRIPE_PRICE_USD_MONTHLY' : 'STRIPE_PRICE_GBP_MONTHLY'})` }, { status: 500 })
    }

    if (!process.env.NEXT_PUBLIC_APP_URL) {
      return NextResponse.json({ error: 'NEXT_PUBLIC_APP_URL is not set in environment variables' }, { status: 500 })
    }

    // Get or create Stripe customer
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id, full_name')
      .eq('id', user.id)
      .single()

    let customerId = profile?.stripe_customer_id

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email!,
        name: profile?.full_name ?? undefined,
        metadata: { supabase_user_id: user.id },
      })
      customerId = customer.id

      await supabase
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
        metadata: { supabase_user_id: user.id },
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    const msg = (err as any)?.message ?? 'Something went wrong'
    console.error('Stripe checkout error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
