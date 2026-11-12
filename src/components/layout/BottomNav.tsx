'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BookOpen, ClipboardCheck, Home, NotebookPen, Sparkles } from 'lucide-react'
import { cn } from '@/lib/cn'

export type NavLabels = {
  home: string
  myPlan: string
  checkIn: string
  journal: string
  learn: string
}

const ITEMS = [
  { href: '/dashboard', key: 'home', Icon: Home },
  { href: '/my-plan', key: 'myPlan', Icon: Sparkles },
  { href: '/symptom-checkin', key: 'checkIn', Icon: ClipboardCheck },
  { href: '/journal', key: 'journal', Icon: NotebookPen },
  { href: '/learn', key: 'learn', Icon: BookOpen },
] as const

/**
 * Bottom tab bar. A client component only so it can tell which section she is
 * in: the current tab is marked visually and with aria-current for screen readers.
 */
export default function BottomNav({ labels }: { labels: NavLabels }) {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 safe-bottom z-50">
      <div className="flex items-center justify-around max-w-lg mx-auto px-2 py-2">
        {ITEMS.map(({ href, key, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`)
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-w-14 flex-col items-center gap-0.5 rounded-xl px-3 py-1 transition-colors hover:bg-brand-50',
                active ? 'text-brand-900' : 'text-gray-500'
              )}
            >
              <Icon aria-hidden="true" className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
              <span className={cn('text-xs', active ? 'font-semibold' : 'font-medium')}>
                {labels[key]}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
