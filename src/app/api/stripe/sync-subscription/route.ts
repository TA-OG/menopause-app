import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/rate-limit'
import { syncSubscriptionFromStripe } from '@/lib/subscription-sync'

/**
 * Self-serve subscription reconciliation. Lets a logged-in user force a
 * re-sync of their own subscription status straight from Stripe, for the
 * case where the webhook never resolved it (see migration 023 and
 * api/stripe/webhook/route.ts for the failure mode this recovers from).
 */
export async function POST(request: NextRequest) {
  const { success } = await rateLimit(request, { limit: 10, windowMs: 60_000 })
  if (!success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const admin = createAdminClient()
    const result = await syncSubscriptionFromStripe(admin, user.id)
    return NextResponse.json(result)
  } catch (err) {
    console.error(`sync-subscription failed for user ${user.id}:`, err)
    return NextResponse.json({ error: 'Could not reach Stripe. Please try again shortly.' }, { status: 502 })
  }
}
