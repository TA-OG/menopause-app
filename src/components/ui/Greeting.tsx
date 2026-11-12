'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

/**
 * Greeting component — uses the user's local device time, not server UTC, so
 * Lagos (UTC+1) and Karachi (UTC+5) get the right time-of-day greeting rather
 * than whatever the Vercel server thinks it is.
 *
 * The hour is read after mount, never during render. Reading it during render
 * made the server's HTML ("Good morning") disagree with the browser's first
 * render ("Good evening"), which React reports as a hydration error in the
 * console. Until the real hour is known the heading is invisible but still
 * occupies its space, so nothing jumps.
 */

type Part = 'morning' | 'afternoon' | 'evening'

function partOfDay(hour: number): Part {
  return hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
}

export default function Greeting({ firstName }: { firstName: string | null }) {
  const t = useTranslations('Greeting')
  const [part, setPart] = useState<Part>('morning')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setPart(partOfDay(new Date().getHours()))
    setReady(true)
  }, [])

  return (
    <div>
      <h1 className={`text-2xl font-bold text-brand-900 break-words ${ready ? '' : 'invisible'}`}>
        {firstName ? t(part, { name: firstName }) : t(`${part}NoName`)}
      </h1>
      <p className="text-gray-500 mt-1 text-sm">{t('howAreYou')}</p>
    </div>
  )
}
