import Link from 'next/link'
import Logo from '@/components/ui/Logo'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Home', icon: '🏠' },
  { href: '/my-plan', label: 'My Plan', icon: '✨' },
  { href: '/symptom-checkin', label: 'Check in', icon: '📊' },
  { href: '/journal', label: 'Journal', icon: '📓' },
  { href: '/learn', label: 'Learn', icon: '📚' },
]

export default function NavBar() {
  return (
    <>
      {/* Top bar with logo + profile/account access (incl. sign out) */}
      <header className="fixed top-0 left-0 right-0 bg-white border-b border-gray-100 z-50">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center max-w-lg mx-auto px-4 py-2">
          <Link
            href="/refer"
            aria-label="Invite friends and earn free months"
            className="justify-self-start text-xl leading-none p-1.5 rounded-full hover:bg-brand-50 transition-colors"
          >
            🎁
          </Link>
          <Logo size="sm" />
          <Link
            href="/profile"
            aria-label="Profile and account settings"
            className="justify-self-end text-xl leading-none p-1.5 rounded-full hover:bg-brand-50 transition-colors"
          >
            👤
          </Link>
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
