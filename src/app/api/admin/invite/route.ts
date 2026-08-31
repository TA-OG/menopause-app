import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin-auth'
import { rateLimit } from '@/lib/rate-limit'
import { findUserByEmail } from '@/lib/find-user'
import { sendInviteEmail } from '@/lib/invite-email'
import {
  COMPLIMENTARY_PREMIUM_MONTHS,
  scheduleComplimentaryPremium,
} from '@/lib/complimentary-premium'

/**
 * Invite a waitlist signup to the app.
 *
 * Every invite sent from here carries a complimentary premium account for
 * COMPLIMENTARY_PREMIUM_MONTHS months — that is the promise the admin panel
 * makes, so it is applied automatically rather than being a per-invite choice
 * someone can forget to tick.
 *
 * When the grant happens is decided by scheduleComplimentaryPremium: it is
 * deferred to first sign-in for anyone who has not signed in yet, so the 12
 * months always mean twelve months of usable access rather than starting while
 * the invite sits unread in an inbox — and no Stripe customer or subscription
 * is created for an invite nobody ever accepts.
 *
 * Ordering matters and is deliberate: the invite email goes first and cannot be
 * recalled once sent. The admin_invites row is written after it, so the log
 * always reflects what actually happened.
 *
 * Delivery is handled by sendInviteEmail(), which covers the case this route
 * used to get wrong: Supabase refuses inviteUserByEmail for an account that
 * already exists, so a re-invite — the very thing an admin does when someone
 * says "I never got it" — sent nothing while this route reported success.
 */
export async function POST(request: NextRequest) {
  // Creating Stripe subscriptions is a real side effect — bound how fast it
  // can be driven, even from an authenticated admin session.
  const { success } = await rateLimit(request, { limit: 30, windowMs: 60_000 })
  if (!success) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  const supabase = createClient()
  const auth = await requireAdmin(supabase)
  if (auth instanceof NextResponse) return auth

  const { waitlistId, email, firstName } = await request.json()

  if (!waitlistId || !email || !firstName) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const admin = createAdminClient()
  const normalisedEmail = String(email).trim().toLowerCase()

  try {
    // 1. Get them a link into the app — a Supabase invite for a new account,
    //    or a freshly generated magic link for one that already exists.
    const delivery = await sendInviteEmail(admin, {
      email: normalisedEmail,
      firstName,
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/onboarding`,
    })

    let userId = delivery.userId
    const alreadyRegistered = delivery.alreadyRegistered
    let hasSignedIn = Boolean(delivery.lastSignInAt)

    // sendInviteEmail resolves the user from the call it already made, so the
    // listUsers page-walk below is only needed when it could not — a genuine
    // send failure against an account that may still exist.
    if (!userId && alreadyRegistered) {
      const existing = await findUserByEmail(admin, normalisedEmail)
      userId = existing?.id ?? null
      hasSignedIn = Boolean(existing?.lastSignInAt)
    }

    // Nothing was sent and there is no account to attach anything to, so the
    // invite simply did not happen. Fail loudly rather than marking the person
    // converted on the waitlist and reporting success — that combination is
    // what let four women be told they had been invited when they had not.
    if (delivery.failed && !userId) {
      return NextResponse.json({ error: delivery.error ?? 'Invite failed' }, { status: 502 })
    }

    // 2. Mark as converted on the waitlist.
    const { error: updateError } = await admin
      .from('waitlist_signups')
      .update({
        converted_to_user: true,
        converted_at: new Date().toISOString(),
      })
      .eq('id', waitlistId)

    if (updateError) throw updateError

    // 3. Attach the complimentary premium and log the invite. Without a user
    //    id there is nothing to attach it to, so that case is recorded as a
    //    failure needing follow-up — the email has already gone out.
    if (!userId) {
      const complimentaryError =
        'Invite sent, but the invited user could not be located, so no complimentary premium was scheduled.'

      const { error: logError } = await admin.from('admin_invites').insert({
        email: normalisedEmail,
        first_name: firstName,
        waitlist_id: waitlistId,
        invited_by: auth.id,
        invite_kind: 'waitlist',
        already_registered: alreadyRegistered,
        email_status: delivery.status,
        email_error: delivery.error,
        complimentary_status: 'failed',
        complimentary_months: COMPLIMENTARY_PREMIUM_MONTHS,
        error: complimentaryError,
      })
      if (logError) {
        console.error('Admin invite: failed to write admin_invites log row', logError)
      }

      return NextResponse.json({
        success: true,
        alreadyRegistered,
        emailDelivery: { status: delivery.status, failed: delivery.failed, error: delivery.error },
        complimentary: {
          status: 'failed',
          months: COMPLIMENTARY_PREMIUM_MONTHS,
          error: complimentaryError,
        },
      })
    }

    const complimentary = await scheduleComplimentaryPremium(admin, {
      userId,
      email: normalisedEmail,
      firstName,
      invitedBy: auth.id,
      inviteKind: 'waitlist',
      waitlistId,
      alreadyRegistered,
      hasSignedIn,
      emailStatus: delivery.status,
      emailError: delivery.error,
    })

    return NextResponse.json({
      success: true,
      alreadyRegistered,
      emailDelivery: { status: delivery.status, failed: delivery.failed, error: delivery.error },
      complimentary: {
        status: complimentary.status,
        months: complimentary.months,
        expiresAt: complimentary.expiresAt,
        error: complimentary.error,
      },
    })
  } catch (err) {
    console.error('Admin invite error:', err)
    return NextResponse.json(
      { error: (err as Error)?.message ?? 'Invite failed' },
      { status: 500 },
    )
  }
}
