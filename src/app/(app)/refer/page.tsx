import { pageTitle } from '@/lib/page-meta'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import ReferralCard from '@/components/referral/ReferralCard'

export async function generateMetadata() {
  return pageTitle('Refer')
}

export default async function ReferPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/sign-in')

  const t = await getTranslations('Refer')

  return (
    <div className="space-y-6 py-4">
      <div>
        <h1 className="text-2xl font-bold text-brand-900">{t('title')}</h1>
        <p className="text-gray-500 text-sm mt-1">{t('subtitle')}</p>
      </div>

      <ReferralCard />

      <div className="bg-gray-50 rounded-2xl p-5 text-sm text-gray-600 space-y-2">
        <p className="font-semibold text-gray-900">{t('howItWorks')}</p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>{t('step1')}</li>
          <li>{t('step2')}</li>
          <li>{t('step3')}</li>
          <li>{t('step4')}</li>
        </ol>
      </div>
    </div>
  )
}
