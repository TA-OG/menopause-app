'use client'

import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { LOCALE_LABELS, type Locale } from '@/lib/locale-geo-map'

export default function AutoLocaleBanner({ locale }: { locale: Locale }) {
  const t = useTranslations('AutoLocaleNotice')
  const router = useRouter()
  const [dismissed, setDismissed] = useState(false)
  const [pending, setPending] = useState(false)

  // "Keep" re-posts the same locale purely to clear the NEXT_LOCALE_AUTO
  // marker server-side (see /api/locale) — it always clears that cookie,
  // regardless of which locale is chosen.
  async function setLocale(target: Locale) {
    setPending(true)
    try {
      await fetch('/api/locale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale: target }),
      })
      setDismissed(true)
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  if (dismissed) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 max-w-lg mx-auto bg-brand-900 text-white rounded-2xl p-4 shadow-lg z-[60] flex items-center justify-between gap-3 safe-bottom">
      <p className="text-sm">{t('message', { language: LOCALE_LABELS[locale] })}</p>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => setLocale(locale)}
          disabled={pending}
          className="text-xs font-semibold bg-white text-brand-900 px-3 py-1.5 rounded-xl disabled:opacity-50"
        >
          {t('keep')}
        </button>
        <button
          onClick={() => setLocale('en')}
          disabled={pending}
          className="text-xs font-medium underline disabled:opacity-50"
        >
          {t('switchToEnglish')}
        </button>
      </div>
    </div>
  )
}
