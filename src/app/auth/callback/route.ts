import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { claimReferral } from '@/lib/referral-rewards'
import { activatePendingComplimentaryPremium } from '@/lib/complimentary-premium'

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

        // Start the complimentary premium clock for an admin-invited user, so
        // their 12 months run from the first time they can actually use the
        // app rather than from the moment the invite was sent. Like
        // claimReferral above, this is safe on every login and a no-op once
        // there is nothing pending — and it never throws, so a Stripe problem
        // cannot block someone from getting into the app.
        if (user.email) {
          await activatePendingComplimentaryPremium(createAdminClient(), user.id, user.email)
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
