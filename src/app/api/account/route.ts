import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/rate-limit'
import { recordEvent } from '@/lib/monitoring'
import { DELETE_CONFIRMATION, type DeleteAccountErrorCode } from '@/lib/account-deletion'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-04-10',
})

// The typed confirmation is checked here too, not just in the UI.
const DeleteAccountSchema = z.object({
  confirm: z.literal(DELETE_CONFIRMATION),
}).strict()

/**
 * DELETE /api/account — permanently delete the signed-in user's account and
 * all of their personal data.
 *
 * Order matters:
 *   1. Stripe first. Deleting the Stripe customer cancels any subscription
 *      immediately. If that fails we stop, because erasing the account while
 *      a subscription is still live would keep charging someone who no
 *      longer has an account, with nothing left to manage it from.
 *   2. erase_user() (migration 041) in one database transaction: anonymises
 *      email-linked rows, deletes the auth user (cascading to every user
 *      table), and removes the audit_logs copies of her health data.
 *   3. Sign out, clearing the session cookies on this device.
 *
 * Invoices and payment history stay in Stripe, which is where the financial
 * records UK tax law requires us to keep actually live.
 */
export async function DELETE(request: NextRequest) {
  const { success } = await rateLimit(request, { limit: 3, windowMs: 60_000 })
  if (!success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!DeleteAccountSchema.safeParse(body).success) {
    return NextResponse.json(
      { error: `Type ${DELETE_CONFIRMATION} to confirm.`, code: 'confirm_required' satisfies DeleteAccountErrorCode },
      { status: 400 }
    )
  }

  const admin = createAdminClient()

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('stripe_customer_id, is_admin')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    return failed(user.id, 'profile lookup', profileError, 'nothing_deleted')
  }

  // An admin deleting themselves would also remove their access to the admin
  // panel and authoring tools, possibly the only account that has it. Not
  // something to allow from a button on the profile page.
  if (profile?.is_admin) {
    return NextResponse.json(
      {
        error: 'Admin accounts can\'t be deleted from the app. Please email privacy@auntymel.app.',
        code: 'admin' satisfies DeleteAccountErrorCode,
      },
      { status: 403 }
    )
  }

  if (profile?.stripe_customer_id) {
    try {
      await stripe.customers.del(profile.stripe_customer_id)
    } catch (err) {
      // Already gone from Stripe (deleted there by hand, or a retry of a
      // previous attempt that got this far) — nothing left to cancel.
      const alreadyDeleted = err instanceof Stripe.errors.StripeInvalidRequestError && err.code === 'resource_missing'
      if (!alreadyDeleted) return failed(user.id, 'Stripe cancellation', err, 'nothing_deleted')
    }
  }

  const { error: eraseError } = await admin.rpc('erase_user', { p_user_id: user.id })
  if (eraseError) {
    // erase_user is one transaction, so all of her data is still there — but
    // the Stripe step above may already have cancelled her subscription.
    // Retrying is safe: Stripe then reports the customer as already gone.
    return failed(
      user.id,
      'erase_user',
      eraseError,
      profile?.stripe_customer_id ? 'subscription_cancelled' : 'nothing_deleted'
    )
  }

  // The user no longer exists, so this can only clear this device's cookies;
  // a failure here doesn't undo anything and the session is already invalid.
  await supabase.auth.signOut().catch(() => {})

  await recordEvent({
    type: 'request',
    level: 'info',
    route: '/api/account',
    method: 'DELETE',
    status: 200,
    message: 'account deleted',
    meta: { had_stripe_customer: !!profile?.stripe_customer_id },
  })

  return NextResponse.json({ deleted: true })
}

// English, for logs and other API callers. The profile dialog shows the
// code's message in her own language (DeleteAccount.error* in messages/*.json).
const FAILURE_MESSAGE: Record<'nothing_deleted' | 'subscription_cancelled', string> = {
  nothing_deleted:
    'We couldn\'t delete your account just now, and nothing has been deleted. ' +
    'Please try again, or email privacy@auntymel.app and we\'ll do it for you.',
  subscription_cancelled:
    'Your subscription has been cancelled, but we couldn\'t finish deleting your account. ' +
    'Please try again, or email privacy@auntymel.app and we\'ll do it for you.',
}

async function failed(
  userId: string,
  step: string,
  err: unknown,
  code: 'nothing_deleted' | 'subscription_cancelled'
) {
  const message = err instanceof Error ? err.message : JSON.stringify(err)
  console.error(`Account deletion failed at ${step} for ${userId}:`, err)
  await recordEvent({
    type: 'error',
    route: '/api/account',
    method: 'DELETE',
    status: 500,
    message: `Account deletion failed at ${step}: ${message}`,
    stack: err instanceof Error ? err.stack ?? null : null,
    userId,
  })
  return NextResponse.json({ error: FAILURE_MESSAGE[code], code }, { status: 500 })
}
