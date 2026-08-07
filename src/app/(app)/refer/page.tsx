import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ReferralCard from '@/components/referral/ReferralCard'

export default async function ReferPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/sign-in')

  return (
    <div className="space-y-6 py-4">
      <div>
        <h1 className="text-2xl font-bold text-brand-900">Invite friends</h1>
        <p className="text-gray-500 text-sm mt-1">
          Share Aunty Mel with someone who needs it. You both get a free month.
        </p>
      </div>

      <ReferralCard />

      <div className="bg-gray-50 rounded-2xl p-5 text-sm text-gray-600 space-y-2">
        <p className="font-semibold text-gray-900">How it works</p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Share your personal link with a friend.</li>
          <li>They sign up and subscribe using your link.</li>
          <li>Once their first payment goes through, you both get one month free.</li>
          <li>Refer more friends to stack up to 6 free months.</li>
        </ol>
      </div>
    </div>
  )
}
