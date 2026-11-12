import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { Gift, User } from 'lucide-react'
import Logo from '@/components/ui/Logo'
import BottomNav from './BottomNav'
import LanguageSwitcher from './LanguageSwitcher'
import { isSupportedLocale, type Locale } from '@/lib/locale-geo-map'

export default async function NavBar() {
  const t = await getTranslations('NavBar')
  const rawLocale = await getLocale()
  const locale: Locale = isSupportedLocale(rawLocale) ? rawLocale : 'en'

  return (
    <>
      {/* Top bar with logo + profile/account access (incl. sign out) */}
      <header className="fixed top-0 left-0 right-0 bg-white border-b border-gray-100 z-50">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center max-w-lg mx-auto px-4 py-2">
          <Link
            href="/refer"
            aria-label={t('inviteAria')}
            className="justify-self-start rounded-full p-2 text-brand-900 transition-colors hover:bg-brand-50"
          >
            <Gift aria-hidden="true" className="h-5 w-5" />
          </Link>
          <Link href="/dashboard">
            <Logo size="sm" />
          </Link>
          <div className="justify-self-end flex items-center gap-1">
            <LanguageSwitcher currentLocale={locale} />
            <Link
              href="/profile"
              aria-label={t('profileAria')}
              className="rounded-full p-2 text-brand-900 transition-colors hover:bg-brand-50"
            >
              <User aria-hidden="true" className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Bottom nav */}
      <BottomNav
        labels={{
          home: t('home'),
          myPlan: t('myPlan'),
          checkIn: t('checkIn'),
          journal: t('journal'),
          learn: t('learn'),
        }}
      />
    </>
  )
}
