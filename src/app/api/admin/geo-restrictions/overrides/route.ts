import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin-auth'
import { rateLimit } from '@/lib/rate-limit'
import { sanitizeError } from '@/lib/sanitize-error'
import { findUserByEmail } from '@/lib/find-user'
import { sendInviteEmail } from '@/lib/invite-email'
import { scheduleComplimentaryPremium } from '@/lib/complimentary-premium'

export const dynamic = 'force-dynamic'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * GET  /api/admin/geo-restrictions/overrides — list all per-user access overrides.
 * POST /api/admin/geo-restrictions/overrides — grant one by email.
 *        body: { email: string, reason?: string|null, expires_at?: string|null }
 *
 * An override gives that user full access regardless of their country. The
 * person is invited by email if they do not have an account yet, and carries
 * the same complimentary premium (COMPLIMENTARY_PREMIUM_MONTHS, currently 12
 * months) as a waitlist invite — geographic access on its own would only carry
 * a tester as far as the paywall.
 */
export async function GET(request: NextRequest) {
  const { success } = await rateLimit(request, { limit: 60, windowMs: 60_000 })
  if (!success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  const supabase = createClient()
  const auth = await requireAdmin(supabase)
  if (auth instanceof NextResponse) return auth

  try {
    const admin = createAdminClient()
    const { data: rows, error } = await admin
      .from('geo_access_overrides')
      .select('id, user_id, reason, expires_at, created_at')
      .order('created_at', { ascending: false })

    if (error) throw error

    // Decorate with email + name from the profile for a readable list.
    const overrides = await Promise.all(
      (rows ?? []).map(async (o) => {
        const { data: profile } = await admin
          .from('profiles')
          .select('full_name')
          .eq('id', o.user_id)
          .maybeSingle()
        const { data: authUser } = await admin.auth.admin.getUserById(o.user_id)
        return {
          ...o,
          email: authUser?.user?.email ?? null,
          full_name: profile?.full_name ?? null,
        }
      }),
    )

    return NextResponse.json({ overrides })
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const { success } = await rateLimit(request, { limit: 30, windowMs: 60_000 })
  if (!success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  const supabase = createClient()
  const auth = await requireAdmin(supabase)
  if (auth instanceof NextResponse) return auth

  const body = await request.json().catch(() => null)
  const email = body?.email?.trim()?.toLowerCase()
  const reason = body?.reason?.trim() || null
  const expires_at = body?.expires_at ?? null

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 })
  }

  // Validated here rather than left to Postgres: everything below this point
  // has irreversible side effects (an invite email, a Stripe subscription), so
  // a malformed expiry must be rejected before any of them run.
  if (expires_at !== null && (typeof expires_at !== 'string' || Number.isNaN(Date.parse(expires_at)))) {
    return NextResponse.json(
      { error: 'expires_at must be an ISO date string, or null for no expiry' },
      { status: 400 },
    )
  }

  try {
    const admin = createAdminClient()

    // 1. Resolve the account, inviting them if there is not one yet.
    //
    //    An override is how a tester or beta pilot is stood up, and requiring
    //    them to have signed up first made that impossible for anyone who has
    //    never used the app. The Supabase invite email creates the auth user
    //    (and, via the on_auth_user_created trigger, their profile), which is
    //    what the override row and the complimentary grant both hang off.
    //
    //    Ordering is deliberate and unavoidable: the invite email cannot be
    //    recalled once sent, and nothing below can run without the user id it
    //    produces. Everything after it therefore records its own outcome
    //    rather than being allowed to fail silently.
    //
    //    The email goes out whether or not the account already exists. An
    //    override is only useful once the person actually opens the app, and
    //    someone who signed up months ago and forgot has no more idea she has
    //    been granted access than someone who never had an account at all —
    //    previously she was told nothing.
    const delivery = await sendInviteEmail(admin, {
      email,
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/onboarding`,
    })

    let userId = delivery.userId
    const alreadyRegistered = delivery.alreadyRegistered
    let hasSignedIn = Boolean(delivery.lastSignInAt)
    const invited = delivery.status === 'invite_sent'

    if (!userId) {
      const existing = await findUserByEmail(admin, email)
      userId = existing?.id ?? null
      hasSignedIn = Boolean(existing?.lastSignInAt)
    }

    if (!userId) {
      return NextResponse.json(
        {
          error:
            delivery.error ??
            'The invited account could not be located, so no override or complimentary premium was applied. Try again in a moment.',
        },
        { status: 502 },
      )
    }

    // 2. Grant the geographic override itself.
    const { data: override, error } = await admin
      .from('geo_access_overrides')
      .upsert(
        { user_id: userId, granted_by: auth.id, reason, expires_at },
        { onConflict: 'user_id' },
      )
      .select('id, user_id, reason, expires_at, created_at')
      .single()

    if (error) throw error

    // 3. Attach the complimentary premium and log the invite. Never throws:
    //    the override is already granted and the email already sent, so a
    //    billing failure has to be reported, not lost.
    const complimentary = await scheduleComplimentaryPremium(admin, {
      userId,
      email,
      invitedBy: auth.id,
      inviteKind: 'access_override',
      alreadyRegistered,
      hasSignedIn,
      emailStatus: delivery.status,
      emailError: delivery.error,
    })

    return NextResponse.json({
      ok: true,
      override: { ...override, email },
      invited,
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
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 })
  }
}
