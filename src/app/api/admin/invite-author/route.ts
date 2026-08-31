import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { findUserIdByEmail } from '@/lib/find-user'
import { sendInviteEmail } from '@/lib/invite-email'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Invites a content author (e.g. Pamela) and grants them access to the
 * admin intake tool. Unlike a normal user, an author:
 *   - is flagged is_admin = true (so /admin/* is reachable), and
 *   - has onboarding_complete = true set up-front, so the auth callback
 *     sends them straight to /admin/intake instead of the user onboarding.
 *
 * Their invite email therefore lands them directly on the questionnaire.
 */
export async function POST(request: NextRequest) {
  // 1. Verify the caller is an authenticated admin
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!callerProfile?.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 2. Parse and validate body
  let body: { email?: string; fullName?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const email = body.email?.trim().toLowerCase()
  const fullName = body.fullName?.trim() || undefined

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 })
  }

  const admin = createAdminClient()
  const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/admin/intake`

  try {
    // 3. Send them their link (creates the auth user + profile via trigger for
    //    a new account; a fresh magic link for one that already exists —
    //    promoting an existing user used to send them nothing at all).
    const delivery = await sendInviteEmail(admin, {
      email,
      data: fullName ? { full_name: fullName } : undefined,
      redirectTo,
    })

    const alreadyRegistered = delivery.alreadyRegistered
    let authorId = delivery.userId

    if (!authorId && alreadyRegistered) {
      authorId = await findUserIdByEmail(admin, email)
    }

    if (delivery.failed && !authorId) {
      return NextResponse.json({ error: delivery.error ?? 'Invite failed' }, { status: 502 })
    }

    if (!authorId) {
      return NextResponse.json(
        { error: 'Invite sent, but could not locate the user to grant admin access. Set is_admin manually.' },
        { status: 500 },
      )
    }

    // 4. Promote to author: admin access + skip user onboarding so the
    //    callback routes them straight to /admin/intake.
    const { error: updateError } = await admin
      .from('profiles')
      .update({ is_admin: true, onboarding_complete: true })
      .eq('id', authorId)

    if (updateError) throw updateError

    // Record the invite alongside waitlist invites so the admin dashboard
    // shows one complete list of everyone who has been invited.
    //
    // No complimentary premium is granted here, and that is not an omission:
    // an author has is_admin = true, and getUserAccess() already resolves
    // every admin to full premium access regardless of subscription
    // (see src/lib/access.ts). Giving them a Stripe subscription on top would
    // create a billing artefact for access they already have.
    const { error: logError } = await admin.from('admin_invites').insert({
      email,
      first_name: fullName ?? null,
      user_id: authorId,
      invited_by: user.id,
      invite_kind: 'author',
      already_registered: alreadyRegistered,
      email_status: delivery.status,
      email_error: delivery.error,
      complimentary_status: 'not_attempted',
    })

    if (logError) {
      console.error('Invite author: failed to write admin_invites log row', logError)
    }

    return NextResponse.json({
      success: true,
      email,
      alreadyRegistered,
      emailDelivery: {
        status: delivery.status,
        failed: delivery.failed,
        error: delivery.error,
      },
    })
  } catch (err) {
    console.error('Invite author error:', err)
    return NextResponse.json(
      { error: (err as Error).message ?? 'Invite failed' },
      { status: 500 },
    )
  }
}
