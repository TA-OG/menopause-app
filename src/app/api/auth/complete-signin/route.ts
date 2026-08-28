import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { completeSignIn, safeNext } from '@/lib/post-sign-in'

export const dynamic = 'force-dynamic'

/**
 * POST /api/auth/complete-signin
 *
 * Runs the post-sign-in work for the fragment flow, where the session is
 * established in the browser by /auth/complete and so never passes through a
 * server route that could start someone's complimentary premium.
 *
 * Takes no user id: the caller is identified by the session cookies the
 * browser client has just written, verified here with getUser(). An
 * unauthenticated call can therefore do nothing.
 */
export async function POST(request: NextRequest) {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const next = typeof body?.next === 'string' ? body.next : null
  const refCode = typeof body?.ref === 'string' ? body.ref : null

  try {
    const redirectTo = await completeSignIn(supabase, createAdminClient(), user, {
      next,
      refCode,
    })
    return NextResponse.json({ redirectTo })
  } catch (err) {
    // completeSignIn is written not to throw, but a failure here must still
    // not strand someone who is genuinely signed in — send them into the app.
    console.error('complete-signin: unexpected failure', err)
    return NextResponse.json({ redirectTo: safeNext(next) })
  }
}
