import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  // 1. Verify the caller is an authenticated admin
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 2. Parse and validate body
  const { waitlistId, email, firstName } = await request.json()

  if (!waitlistId || !email || !firstName) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const admin = createAdminClient()

  try {
    // 3. Send Supabase invite email — generates a magic-link sign-up
    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { first_name: firstName },
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/onboarding`,
    })

    if (inviteError) {
      // "User already registered" is not a failure — they just signed up themselves
      if (!inviteError.message.toLowerCase().includes('already registered')) {
        throw inviteError
      }
    }

    // 4. Mark as converted on the waitlist
    const { error: updateError } = await admin
      .from('waitlist_signups')
      .update({
        converted_to_user: true,
        converted_at: new Date().toISOString(),
      })
      .eq('id', waitlistId)

    if (updateError) throw updateError

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Admin invite error:', err)
    return NextResponse.json(
      { error: (err as any)?.message ?? 'Invite failed' },
      { status: 500 }
    )
  }
}
