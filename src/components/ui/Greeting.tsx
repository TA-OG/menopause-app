'use client'

import { useTranslations } from 'next-intl'

/**
 * Greeting component — uses the user's local device time, not server UTC.
 * Rendered client-side so Lagos (UTC+1) and Karachi (UTC+5) get the right
 * time-of-day greeting rather than whatever the Vercel server thinks it is.
 */

export default function Greeting({ firstName }: { firstName: string | null }) {
  const t = useTranslations('Greeting')
  const hour = new Date().getHours()
  const part = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-900">
        {firstName ? t(part, { name: firstName }) : t(`${part}NoName`)} 👋
      </h1>
      <p className="text-gray-500 mt-1 text-sm">{t('howAreYou')}</p>
    </div>
  )
}
