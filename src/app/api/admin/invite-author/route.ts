import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'

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
    // 3. Send the invite (creates the auth user + profile via trigger)
    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      data: fullName ? { full_name: fullName } : undefined,
      redirectTo,
    })

    let authorId = invited?.user?.id ?? null
    let alreadyRegistered = false

    if (inviteError) {
      // Already-registered isn't a failure — just promote the existing user.
      if (inviteError.message.toLowerCase().includes('already')) {
        alreadyRegistered = true
        authorId = await findUserIdByEmail(admin, email)
      } else {
        throw inviteError
      }
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

    return NextResponse.json({ success: true, email, alreadyRegistered })
  } catch (err) {
    console.error('Invite author error:', err)
    return NextResponse.json(
      { error: (err as Error).message ?? 'Invite failed' },
      { status: 500 },
    )
  }
}

/** Find an existing auth user's id by email (paginated admin listing). */
async function findUserIdByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<string | null> {
  const perPage = 1000
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    const match = data.users.find((u) => u.email?.toLowerCase() === email)
    if (match) return match.id
    if (data.users.length < perPage) break
  }
  return null
}
