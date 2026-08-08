import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOrCreateReferralCode, buildAppReferralUrl, REFERRAL_CAP_MONTHS } from '@/lib/referral-rewards'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, referral_months_banked')
    .eq('id', user.id)
    .single()

  const referralCode = await getOrCreateReferralCode(supabase, user.id, profile?.full_name)

  const { count: referredCount } = await supabase
    .from('referrals')
    .select('id', { count: 'exact', head: true })
    .eq('referrer_id', user.id)

  const { data: rewards } = await supabase
    .from('referral_rewards')
    .select('months')
    .eq('user_id', user.id)
    .eq('role', 'referrer')
    .in('status', ['pending', 'applied'])

  const monthsEarned = (rewards ?? []).reduce((sum, r) => sum + r.months, 0)

  return NextResponse.json({
    referralCode,
    referralUrl: buildAppReferralUrl(referralCode),
    referredCount: referredCount ?? 0,
    monthsEarned,
    monthsBanked: profile?.referral_months_banked ?? 0,
    capMonths: REFERRAL_CAP_MONTHS,
    capReached: monthsEarned >= REFERRAL_CAP_MONTHS,
  })
}
