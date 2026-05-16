import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-04-10',
})

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/auth/sign-in', request.url))

  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single()

    if (!profile?.stripe_customer_id) {
      return NextResponse.redirect(new URL('/pay', request.url))
    }

    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: profile.stripe_customer_id,
        return_url: `${process.env.NEXT_PUBLIC_APP_URL}/profile`,
      })
      return NextResponse.redirect(session.url)
    } catch (err: any) {
      // Stale customer ID (e.g. Stripe account was rotated) — clear it and
      // bounce the user back to /pay so they can re-subscribe (which will
      // create a fresh customer in the current account).
      if (err?.code === 'resource_missing') {
        console.warn(`Stale stripe_customer_id ${profile.stripe_customer_id} for user ${user.id} — clearing`)
        await supabase
          .from('profiles')
          .update({ stripe_customer_id: null, subscription_tier: 'free', subscription_status: null })
          .eq('id', user.id)
        return NextResponse.redirect(new URL('/pay', request.url))
      }
      throw err
    }
  } catch (err) {
    console.error('Stripe portal error:', err)
    return NextResponse.redirect(new URL('/profile', request.url))
  }
}
