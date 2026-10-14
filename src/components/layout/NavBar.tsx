import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import Logo from '@/components/ui/Logo'
import LanguageSwitcher from './LanguageSwitcher'
import { isSupportedLocale, type Locale } from '@/lib/locale-geo-map'

export default async function NavBar() {
  const t = await getTranslations('NavBar')
  const rawLocale = await getLocale()
  const locale: Locale = isSupportedLocale(rawLocale) ? rawLocale : 'en'

  const NAV_ITEMS = [
    { href: '/dashboard', label: t('home'), icon: '🏠' },
    { href: '/my-plan', label: t('myPlan'), icon: '✨' },
    { href: '/symptom-checkin', label: t('checkIn'), icon: '📊' },
    { href: '/journal', label: t('journal'), icon: '📓' },
    { href: '/learn', label: t('learn'), icon: '📚' },
  ]

  return (
    <>
      {/* Top bar with logo + profile/account access (incl. sign out) */}
      <header className="fixed top-0 left-0 right-0 bg-white border-b border-gray-100 z-50">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center max-w-lg mx-auto px-4 py-2">
          <Link
            href="/refer"
            aria-label={t('inviteAria')}
            className="justify-self-start text-xl leading-none p-1.5 rounded-full hover:bg-brand-50 transition-colors"
          >
            🎁
          </Link>
          <Logo size="sm" />
          <div className="justify-self-end flex items-center gap-1">
            <LanguageSwitcher currentLocale={locale} />
            <Link
              href="/profile"
              aria-label={t('profileAria')}
              className="text-xl leading-none p-1.5 rounded-full hover:bg-brand-50 transition-colors"
            >
              👤
            </Link>
          </div>
        </div>
      </header>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 safe-bottom z-50">
        <div className="flex items-center justify-around max-w-lg mx-auto px-2 py-2">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl hover:bg-brand-50 transition-colors"
            >
              <span className="text-xl">{item.icon}</span>
              <span className="text-xs text-gray-500 font-medium">{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </>
  )
}
