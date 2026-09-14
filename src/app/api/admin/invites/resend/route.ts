import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin-auth'
import { rateLimit } from '@/lib/rate-limit'
import { sanitizeError } from '@/lib/sanitize-error'
import { findUserByEmail } from '@/lib/find-user'
import { sendInviteEmail } from '@/lib/invite-email'
import {
  COMPLIMENTARY_PREMIUM_MONTHS,
  scheduleComplimentaryPremium,
} from '@/lib/complimentary-premium'
import type { InviteKind } from '@/lib/complimentary-premium-config'

/**
 * POST /api/admin/invites/resend — send someone their link into the app again.
 *
 * ── Why this route exists ────────────────────────────────────────────────────
 *
 * Sending an invite marks the waitlist row `converted_to_user = true`, and the
 * waitlist table only renders its Invite button for rows that are NOT yet
 * converted. So the button disappeared the moment someone was invited —
 * including for the people whose invite email never actually went anywhere.
 *
 * The dashboard banner told admins to "press Invite again on the waitlist",
 * which could not be done. The delivery fix (invite-email.ts) was live and
 * correct, and there was no way to trigger it for the very people it was
 * written for. This is that trigger.
 *
 * ── What it deliberately does NOT do ─────────────────────────────────────────
 *
 * It resends the email and re-runs the complimentary grant, and nothing else.
 * In particular it never writes a `geo_access_overrides` row: the "Invite &
 * Grant" box was the only existing way to re-email an invited person, and it
 * carries a permanent country-restriction bypass as a side effect. Resending a
 * link must not quietly change what someone is entitled to.
 *
 * Re-running the grant is safe and is the point: scheduleComplimentaryPremium
 * refuses to create a second grant when one is already scheduled, and
 * grantComplimentaryPremium leaves a live paying subscription alone and passes
 * Stripe an idempotency key. So a resend tops up nobody and double-charges
 * nobody, while still repairing a grant that failed first time round.
 */

/** Which invite kinds carry complimentary premium, and which do not. */
function grantsComplimentaryPremium(kind: InviteKind): boolean {
  // An author has is_admin = true, and getUserAccess() already resolves every
  // admin to full premium access regardless of subscription (src/lib/access.ts).
  // A Stripe subscription on top would be a billing artefact for access they
  // already have — invite-author/route.ts makes the same call.
  return kind !== 'author'
}

/**
 * Where the link should land them, matching the invite they originally got.
 *
 * An author's link goes to the intake tool rather than user onboarding; the
 * original invite routes set this, and a resend that ignored it would drop
 * Pamela into a symptom questionnaire instead of her own admin tool.
 */
function redirectForKind(kind: InviteKind): string {
  const base = process.env.NEXT_PUBLIC_APP_URL
  return kind === 'author'
    ? `${base}/auth/callback?next=/admin/intake`
    : `${base}/auth/callback?next=/onboarding`
}

export async function POST(request: NextRequest) {
  // Matches the invite route's budget: a resend can create a real Stripe
  // subscription for anyone whose first grant failed, so it is bounded the
  // same way even from an authenticated admin session.
  const { success } = await rateLimit(request, { limit: 30, windowMs: 60_000 })
  if (!success) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  const supabase = createClient()
  const auth = await requireAdmin(supabase)
  if (auth instanceof NextResponse) return auth

  let body: { inviteId?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const inviteId = typeof body.inviteId === 'string' ? body.inviteId.trim() : ''
  if (!inviteId) {
    return NextResponse.json({ error: 'inviteId is required' }, { status: 400 })
  }

  try {
    const admin = createAdminClient()

    // The address is read from the invite log rather than taken from the
    // request. An admin can only resend to someone already invited, so this
    // route can never be used to mail an arbitrary address.
    const { data: invite, error: lookupError } = await admin
      .from('admin_invites')
      .select('id, email, first_name, user_id, waitlist_id, invite_kind')
      .eq('id', inviteId)
      .maybeSingle()

    if (lookupError) throw lookupError
    if (!invite) {
      return NextResponse.json({ error: 'That invite no longer exists' }, { status: 404 })
    }

    const email = String(invite.email).trim().toLowerCase()
    const kind = invite.invite_kind as InviteKind
    const firstName = invite.first_name ?? null

    // 1. Send the link. A brand-new account gets Supabase's invite email; one
    //    that already exists — which every re-invite is, by definition, since
    //    the first invite created the auth user — gets a fresh magic link.
    const delivery = await sendInviteEmail(admin, {
      email,
      firstName,
      redirectTo: redirectForKind(kind),
    })

    // When the send resolved the account, its own answer is authoritative —
    // including a null last_sign_in_at, which genuinely means "never signed
    // in" and is what defers her months to first sign-in rather than spending
    // them while the email sits unread. Only fall back to the page-walking
    // lookup when the send resolved nobody at all.
    let userId = delivery.userId
    let hasSignedIn = Boolean(delivery.lastSignInAt)

    if (!userId) {
      const existing = await findUserByEmail(admin, email)
      userId = existing?.id ?? invite.user_id ?? null
      hasSignedIn = Boolean(existing?.lastSignInAt)
    }

    // Nothing was sent and there is no account to attach anything to, so the
    // resend simply did not happen. Report it rather than logging a row that
    // implies an attempt reached her.
    if (delivery.failed && !userId) {
      return NextResponse.json(
        { error: delivery.error ?? 'Could not resend the invite' },
        { status: 502 },
      )
    }

    // 2. An author gets no complimentary premium, by design. Log the attempt
    //    so the delivery record stays complete either way.
    if (!grantsComplimentaryPremium(kind)) {
      const { error: logError } = await admin.from('admin_invites').insert({
        email,
        first_name: firstName,
        waitlist_id: invite.waitlist_id ?? null,
        user_id: userId,
        invited_by: auth.id,
        invite_kind: kind,
        already_registered: delivery.alreadyRegistered,
        email_status: delivery.status,
        email_error: delivery.error,
        complimentary_status: 'not_attempted',
      })
      if (logError) {
        console.error('Invite resend: failed to write admin_invites log row', logError)
      }

      return NextResponse.json({
        success: true,
        email,
        emailDelivery: {
          status: delivery.status,
          failed: delivery.failed,
          error: delivery.error,
        },
        complimentary: { status: 'not_attempted', months: 0, error: null },
      })
    }

    // 3. The email went out but the account could not be located, so there is
    //    nothing to hang the premium on. Recorded as a failure needing a human
    //    — the email cannot be recalled, so it must not be lost.
    if (!userId) {
      const complimentaryError =
        'Link resent, but the invited user could not be located, so no complimentary premium was scheduled.'

      const { error: logError } = await admin.from('admin_invites').insert({
        email,
        first_name: firstName,
        waitlist_id: invite.waitlist_id ?? null,
        invited_by: auth.id,
        invite_kind: kind,
        already_registered: delivery.alreadyRegistered,
        email_status: delivery.status,
        email_error: delivery.error,
        complimentary_status: 'failed',
        complimentary_months: COMPLIMENTARY_PREMIUM_MONTHS,
        error: complimentaryError,
      })
      if (logError) {
        console.error('Invite resend: failed to write admin_invites log row', logError)
      }

      return NextResponse.json({
        success: true,
        email,
        emailDelivery: {
          status: delivery.status,
          failed: delivery.failed,
          error: delivery.error,
        },
        complimentary: {
          status: 'failed',
          months: COMPLIMENTARY_PREMIUM_MONTHS,
          error: complimentaryError,
        },
      })
    }

    // 4. Re-run the grant and log the attempt. This writes its own
    //    admin_invites row, and no-ops the grant itself when her months are
    //    already scheduled.
    const complimentary = await scheduleComplimentaryPremium(admin, {
      userId,
      email,
      firstName,
      invitedBy: auth.id,
      inviteKind: kind,
      waitlistId: invite.waitlist_id ?? null,
      alreadyRegistered: delivery.alreadyRegistered,
      hasSignedIn,
      emailStatus: delivery.status,
      emailError: delivery.error,
    })

    return NextResponse.json({
      success: true,
      email,
      emailDelivery: {
        status: delivery.status,
        failed: delivery.failed,
        error: delivery.error,
      },
      complimentary: {
        status: complimentary.status,
        months: complimentary.months,
        error: complimentary.error,
      },
    })
  } catch (err) {
    console.error('Invite resend error:', err)
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 })
  }
}
