import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Stripe from 'stripe'

/**
 * Stripe configuration diagnostic endpoint.
 *
 * Tells you definitively:
 *   1. Which Stripe ACCOUNT your secret key belongs to (account id + name)
 *   2. Whether the key is in TEST or LIVE mode
 *   3. Whether each configured price ID actually exists in that account
 *   4. The exact Stripe error if a price isn't found
 *
 * Admin-only. Run from /api/admin/stripe-diagnose in a browser tab while signed in as admin.
 */
export async function GET() {
  // 1. Verify admin
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // 2. Inspect env
  const secretKey = process.env.STRIPE_SECRET_KEY
  const result: any = {
    env: {
      STRIPE_SECRET_KEY_present: !!secretKey,
      STRIPE_SECRET_KEY_mode: secretKey?.startsWith('sk_live_')
        ? 'LIVE'
        : secretKey?.startsWith('sk_test_')
          ? 'TEST'
          : 'UNKNOWN/INVALID',
      STRIPE_PRICE_GBP_MONTHLY: process.env.STRIPE_PRICE_GBP_MONTHLY ?? null,
      STRIPE_PRICE_GBP_YEARLY:  process.env.STRIPE_PRICE_GBP_YEARLY  ?? null,
      STRIPE_PRICE_USD_MONTHLY: process.env.STRIPE_PRICE_USD_MONTHLY ?? null,
      STRIPE_PRICE_USD_YEARLY:  process.env.STRIPE_PRICE_USD_YEARLY  ?? null,
      NEXT_PUBLIC_APP_URL:      process.env.NEXT_PUBLIC_APP_URL      ?? null,
    },
    stripe_account: null,
    price_checks: {} as Record<string, any>,
  }

  if (!secretKey) {
    return NextResponse.json({ ...result, conclusion: 'STRIPE_SECRET_KEY is not set in this deployment.' })
  }

  const stripe = new Stripe(secretKey, { apiVersion: '2024-04-10' })

  // 3. Identify which Stripe account this key belongs to
  try {
    const account = await stripe.accounts.retrieve()
    result.stripe_account = {
      id:           account.id,
      email:        account.email,
      business:     account.business_profile?.name,
      country:      account.country,
      charges_enabled: account.charges_enabled,
    }
  } catch (err: any) {
    result.stripe_account = { error: err.message }
  }

  // 4. Try to retrieve each configured price
  const priceVars = [
    'STRIPE_PRICE_GBP_MONTHLY',
    'STRIPE_PRICE_GBP_YEARLY',
    'STRIPE_PRICE_USD_MONTHLY',
    'STRIPE_PRICE_USD_YEARLY',
  ]
  for (const v of priceVars) {
    const id = process.env[v]
    if (!id) {
      result.price_checks[v] = { status: 'not_configured' }
      continue
    }
    try {
      const price = await stripe.prices.retrieve(id)
      result.price_checks[v] = {
        status:        'found',
        id:            price.id,
        amount:        price.unit_amount,
        currency:      price.currency,
        interval:      price.recurring?.interval,
        active:        price.active,
        product:       price.product,
        livemode:      price.livemode,
      }
    } catch (err: any) {
      result.price_checks[v] = {
        status:    'NOT_FOUND',
        id:        id,
        error:     err.message,
        error_code: err.code,
      }
    }
  }

  // 5. Build a plain-English conclusion
  const failures = Object.entries(result.price_checks)
    .filter(([, v]: [string, any]) => v.status === 'NOT_FOUND')
    .map(([k]) => k)

  if (failures.length > 0) {
    const acctMode = result.env.STRIPE_SECRET_KEY_mode
    result.conclusion = [
      `Your STRIPE_SECRET_KEY is in ${acctMode} mode and belongs to Stripe account "${result.stripe_account?.id}" (${result.stripe_account?.business ?? result.stripe_account?.email ?? 'unknown'}).`,
      `These price IDs don't exist in that account: ${failures.join(', ')}.`,
      `Either: (a) the price IDs were copied from a DIFFERENT Stripe account, (b) they were created in the OTHER mode (test vs live), or (c) the prices were deleted.`,
      `Fix: open Stripe → confirm you're in ${acctMode} mode → confirm the account ID matches "${result.stripe_account?.id}" → copy the price IDs FROM that exact account/mode → update them in Vercel → redeploy.`,
    ].join(' ')
  } else if (Object.values(result.price_checks).every((v: any) => v.status === 'found' || v.status === 'not_configured')) {
    result.conclusion = 'All configured prices were found successfully. Checkout should work.'
  }

  return NextResponse.json(result, { status: 200 })
}
