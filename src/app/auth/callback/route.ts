import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { claimReferral } from '@/lib/referral-rewards'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'
  const refCode = searchParams.get('ref')

  if (code) {
    const supabase = createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Check onboarding status
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        // Record the referral, if any — either passed via ?ref= (Google OAuth
        // path) or carried in user_metadata (magic-link path). Safe to call
        // on every login: claimReferral is a no-op once a user has already
        // been claimed as someone's referred friend.
        const referralCodeUsed = refCode ?? (user.user_metadata?.referral_code as string | undefined)
        if (referralCodeUsed) {
          await claimReferral(createAdminClient(), user.id, referralCodeUsed)
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('onboarding_complete')
          .eq('id', user.id)
          .single()

        if (profile && !profile.onboarding_complete) {
          return NextResponse.redirect(`${origin}/onboarding`)
        }
      }

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/sign-in?error=auth_callback_failed`)
}
