import { createClient } from '@/lib/supabase/server'
import { getUserAccess } from '@/lib/access'
import { redirect } from 'next/navigation'
import NotificationSettings from '@/components/NotificationSettings'
import DeleteAccount from '@/components/DeleteAccount'
import LanguageSettings from '@/components/settings/LanguageSettings'
import { getLocale, getTranslations } from 'next-intl/server'
import { isSupportedLocale, DEFAULT_LOCALE } from '@/lib/locale-geo-map'

export default async function ProfilePage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/sign-in')

  const t = await getTranslations('Profile')
  // The cookie (not profiles.locale) is what every page renders from, so it
  // is the honest "current language" to show here.
  const rawLocale = await getLocale()
  const locale = isSupportedLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, subscription_tier, subscription_status, created_at')
    .eq('id', user.id)
    .single()

  // Single source of truth for effective access — matches every other page.
  // isPaidPremium (not isPremium) gates the Stripe "Manage billing" link
  // below: an admin has full access but no real Stripe subscription to
  // manage, so they should see the upgrade prompt, not a billing portal
  // link that has nothing behind it.
  const { isPremium, isPaidPremium } = await getUserAccess(supabase, user.id)

  const { data: preferences } = await supabase
    .from('user_preferences')
    .select('notification_enabled, notification_hour')
    .eq('user_id', user.id)
    .maybeSingle()

  async function signOut() {
    'use server'
    const supabase = createClient()
    await supabase.auth.signOut()
    redirect('/auth/sign-in')
  }

  return (
    <div className="space-y-6 py-4">
      <h1 className="text-2xl font-bold text-brand-900">{t('title')}</h1>

      {/* Account info */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-3">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide">{t('name')}</p>
          <p className="font-medium text-gray-900 mt-0.5">{profile?.full_name ?? '—'}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide">{t('email')}</p>
          <p className="font-medium text-gray-900 mt-0.5">{user.email}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide">{t('plan')}</p>
          <p className="font-medium mt-0.5">
            {isPremium ? (
              <span className="text-brand-700">{t('premium')}</span>
            ) : (
              <span className="text-gray-600">{t('free')}</span>
            )}
          </p>
        </div>
      </div>

      {/* Language */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <LanguageSettings currentLocale={locale} />
      </div>

      {/* Subscription management */}
      {isPaidPremium ? (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <p className="font-semibold text-gray-900 mb-3">{t('subscription')}</p>
          <form action="/api/stripe/portal" method="POST">
            <button
              type="submit"
              className="w-full border border-gray-200 text-gray-700 font-medium py-2 rounded-xl text-sm hover:bg-gray-50 transition-colors"
            >
              {t('manageBilling')}
            </button>
          </form>
        </div>
      ) : (
        <div className="bg-brand-50 border border-brand-200 rounded-2xl p-5">
          <p className="font-semibold text-brand-900">{t('upgradeTitle')}</p>
          <p className="text-brand-700 text-sm mt-1 mb-3">{t('upgradeBody')}</p>
          <a
            href="/pay"
            className="inline-block bg-brand-900 text-white text-sm font-semibold px-4 py-2 rounded-xl"
          >
            {t('upgradeCta')}
          </a>
        </div>
      )}

      {/* Referrals */}
      <a
        href="/refer"
        className="block bg-brand-50 border border-brand-200 rounded-2xl p-5 hover:bg-brand-100 transition-colors"
      >
        <p className="font-semibold text-brand-900">{t('inviteTitle')}</p>
        <p className="text-brand-700 text-sm mt-1">{t('inviteBody')}</p>
      </a>

      {/* Notifications */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <NotificationSettings
          initialEnabled={preferences?.notification_enabled ?? false}
          initialHour={preferences?.notification_hour ?? null}
        />
      </div>

      {/* Update plan */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <p className="font-semibold text-gray-900 mb-1">{t('updatePlanTitle')}</p>
        <p className="text-sm text-gray-500 mb-3">{t('updatePlanBody')}</p>
        <a
          href="/onboarding"
          className="block text-center border border-brand-200 text-brand-700 font-medium py-2 rounded-xl text-sm hover:bg-brand-50 transition-colors"
        >
          {t('redoIntake')}
        </a>
      </div>

      {/* Sign out */}
      <form action={signOut}>
        <button
          type="submit"
          className="w-full text-gray-400 text-sm py-2 hover:text-gray-600 transition-colors"
        >
          {t('signOut')}
        </button>
      </form>

      {/* Delete account — the data-deletion page sends people here */}
      <DeleteAccount hasSubscription={isPaidPremium} />
    </div>
  )
}
