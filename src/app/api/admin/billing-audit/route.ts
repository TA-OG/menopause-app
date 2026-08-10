import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin-auth'
import { rateLimit } from '@/lib/rate-limit'
import { sanitizeError } from '@/lib/sanitize-error'
import { isEntitledStripeStatus, mapStripeStatusToDb } from '@/lib/stripe-status'
import { syncSubscriptionFromStripe } from '@/lib/subscription-sync'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-04-10',
})

interface AuditRow {
  userId: string
  email: string | null
  isAdmin: boolean
  db: {
    tier: string
    status: string | null
    stripeCustomerId: string | null
    stripeSubscriptionId: string | null
  }
  stripeTruth: {
    subscriptionId: string | null
    status: string | null
    entitled: boolean
  } | null
  drift: boolean
  driftReason: string | null
  fixed?: boolean
}

/**
 * Cross-references every billing-relevant profile against Stripe directly —
 * Stripe is the ground truth, the DB is a cache of it. Flags any account
 * where they disagree. This is the tool for answering "is anything else
 * silently broken like the premium-not-reflecting bug was" instead of
 * checking one account at a time.
 *
 * GET  — report only, no writes.
 * POST — report, then apply syncSubscriptionFromStripe to every drifted
 *        account that has a stripe_customer_id (the only ones we can
 *        correct automatically — see the "anomalies" section for the rest).
 */
async function runAudit(apply: boolean) {
  const admin = createAdminClient()

  const { data: profiles, error } = await admin
    .from('profiles')
    .select('id, subscription_tier, subscription_status, stripe_customer_id, stripe_subscription_id, is_admin')
    .or('stripe_customer_id.not.is.null,subscription_tier.eq.premium')

  if (error) throw error

  const rows: AuditRow[] = []
  const anomalies: { userId: string; email: string | null; reason: string }[] = []

  for (const p of profiles ?? []) {
    const { data: userRes } = await admin.auth.admin.getUserById(p.id)
    const email = userRes?.user?.email ?? null

    if (!p.stripe_customer_id) {
      // subscription_tier = 'premium' with nothing to verify it against.
      // Could be a legitimate manual/comped grant — flag for a human, don't
      // auto-touch it.
      anomalies.push({
        userId: p.id,
        email,
        reason: `subscription_tier is 'premium' but there is no stripe_customer_id to verify it against (is_admin=${p.is_admin})`,
      })
      continue
    }

    const subscriptions = await stripe.subscriptions.list({
      customer: p.stripe_customer_id,
      status: 'all',
      limit: 10,
    })

    const live = subscriptions.data.find((s) => isEntitledStripeStatus(s.status))
    const chosen = live ?? [...subscriptions.data].sort((a, b) => b.created - a.created)[0] ?? null

    const stripeTruth = chosen
      ? {
          subscriptionId: chosen.id,
          status: mapStripeStatusToDb(chosen.status),
          entitled: isEntitledStripeStatus(chosen.status),
        }
      : { subscriptionId: null, status: null, entitled: false }

    const expectedTier = stripeTruth.entitled ? 'premium' : 'free'
    const drift =
      p.subscription_tier !== expectedTier ||
      p.stripe_subscription_id !== stripeTruth.subscriptionId ||
      (stripeTruth.subscriptionId !== null && p.subscription_status !== stripeTruth.status)

    let driftReason: string | null = null
    if (drift) {
      const parts: string[] = []
      if (p.subscription_tier !== expectedTier) {
        parts.push(`tier is '${p.subscription_tier}' but Stripe says '${expectedTier}'`)
      }
      if (p.stripe_subscription_id !== stripeTruth.subscriptionId) {
        parts.push(`stripe_subscription_id is '${p.stripe_subscription_id}' but Stripe's current subscription is '${stripeTruth.subscriptionId}'`)
      }
      if (stripeTruth.subscriptionId !== null && p.subscription_status !== stripeTruth.status) {
        parts.push(`status is '${p.subscription_status}' but Stripe says '${stripeTruth.status}'`)
      }
      driftReason = parts.join('; ')
    }

    const row: AuditRow = {
      userId: p.id,
      email,
      isAdmin: p.is_admin,
      db: {
        tier: p.subscription_tier,
        status: p.subscription_status,
        stripeCustomerId: p.stripe_customer_id,
        stripeSubscriptionId: p.stripe_subscription_id,
      },
      stripeTruth,
      drift,
      driftReason,
    }

    if (drift && apply) {
      const result = await syncSubscriptionFromStripe(admin, p.id)
      row.fixed = result.synced || result.tier === expectedTier
    }

    rows.push(row)
  }

  // Secondary signal: any webhook event that never completed successfully.
  const { data: unresolvedEvents } = await admin
    .from('payment_events')
    .select('stripe_event_id, event_type, status, error, processed_at')
    .neq('status', 'completed')
    .order('processed_at', { ascending: false })
    .limit(50)

  return {
    checked: rows.length,
    driftCount: rows.filter((r) => r.drift).length,
    drifted: rows.filter((r) => r.drift),
    clean: rows.filter((r) => !r.drift),
    anomalies,
    unresolvedWebhookEvents: unresolvedEvents ?? [],
    appliedFixes: apply,
  }
}

export async function GET(request: NextRequest) {
  const { success } = rateLimit(request, { limit: 10, windowMs: 60_000 })
  if (!success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  const supabase = createClient()
  const auth = await requireAdmin(supabase)
  if (auth instanceof NextResponse) return auth

  try {
    const report = await runAudit(false)
    return NextResponse.json(report)
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const { success } = rateLimit(request, { limit: 5, windowMs: 60_000 })
  if (!success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  const supabase = createClient()
  const auth = await requireAdmin(supabase)
  if (auth instanceof NextResponse) return auth

  try {
    const report = await runAudit(true)
    return NextResponse.json(report)
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 })
  }
}
