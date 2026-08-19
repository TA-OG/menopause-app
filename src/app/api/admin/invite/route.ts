import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin-auth'
import { rateLimit } from '@/lib/rate-limit'
import { findUserIdByEmail } from '@/lib/find-user'
import {
  grantComplimentaryPremium,
  COMPLIMENTARY_PREMIUM_MONTHS,
  type ComplimentaryGrantResult,
} from '@/lib/complimentary-premium'

/**
 * Invite a waitlist signup to the app.
 *
 * Every invite sent from here carries a complimentary premium account for
 * COMPLIMENTARY_PREMIUM_MONTHS months — that is the promise the admin panel
 * makes, so it is applied automatically rather than being a per-invite choice
 * someone can forget to tick.
 *
 * Ordering matters and is deliberate: the Supabase invite email goes first and
 * cannot be recalled once sent. Everything after it is therefore best-effort
 * and fully recorded — a failed grant still produces an admin_invites row with
 * complimentary_status = 'failed' and the reason, so an invited woman who did
 * not actually receive her 12 months is visible in the dashboard rather than
 * silently hitting a paywall she was told she would not see.
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
    // 1. Send the Supabase invite email — generates a magic-link sign-up.
    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
      normalisedEmail,
      {
        data: { first_name: firstName },
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/onboarding`,
      },
    )

    let userId = invited?.user?.id ?? null
    let alreadyRegistered = false

    if (inviteError) {
      // "User already registered" is not a failure — they just signed up
      // themselves. Resolve their id so they still get their complimentary
      // months.
      if (inviteError.message.toLowerCase().includes('already registered')) {
        alreadyRegistered = true
        userId = await findUserIdByEmail(admin, normalisedEmail)
      } else {
        throw inviteError
      }
    }

    // 2. Grant the complimentary premium account.
    const complimentary: ComplimentaryGrantResult = userId
      ? await grantComplimentaryPremium(admin, {
          userId,
          email: normalisedEmail,
          fullName: firstName,
          grantedBy: auth.id,
        })
      : {
          status: 'failed',
          months: COMPLIMENTARY_PREMIUM_MONTHS,
          expiresAt: null,
          stripeSubscriptionId: null,
          error:
            'Invite sent, but the invited user could not be located, so complimentary premium was not applied.',
        }

    // 3. Mark as converted on the waitlist.
    const { error: updateError } = await admin
      .from('waitlist_signups')
      .update({
        converted_to_user: true,
        converted_at: new Date().toISOString(),
      })
      .eq('id', waitlistId)

    if (updateError) throw updateError

    // 4. Record the invite. Written last so it reflects the real outcome, and
    //    never allowed to fail the request — the invite genuinely was sent.
    const { error: logError } = await admin.from('admin_invites').insert({
      email: normalisedEmail,
      first_name: firstName,
      waitlist_id: waitlistId,
      user_id: userId,
      invited_by: auth.id,
      invite_kind: 'waitlist',
      already_registered: alreadyRegistered,
      complimentary_status: complimentary.status,
      complimentary_months: complimentary.months,
      complimentary_expires_at: complimentary.expiresAt,
      stripe_subscription_id: complimentary.stripeSubscriptionId,
      error: complimentary.error,
    })

    if (logError) {
      console.error('Admin invite: failed to write admin_invites log row', logError)
    }

    return NextResponse.json({
      success: true,
      alreadyRegistered,
      complimentary,
    })
  } catch (err) {
    console.error('Admin invite error:', err)
    return NextResponse.json(
      { error: (err as Error)?.message ?? 'Invite failed' },
      { status: 500 },
    )
  }
}
