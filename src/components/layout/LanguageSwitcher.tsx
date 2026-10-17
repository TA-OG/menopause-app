'use client'

import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { LOCALE_LABELS, SUPPORTED_LOCALES, type Locale } from '@/lib/locale-geo-map'

export default function LanguageSwitcher({ currentLocale }: { currentLocale: Locale }) {
  const t = useTranslations('LanguageSwitcher')
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const locale = e.target.value
    setPending(true)
    try {
      await fetch('/api/locale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale }),
      })
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  return (
    <select
      aria-label={t('label')}
      value={currentLocale}
      onChange={handleChange}
      disabled={pending}
      className="text-xs text-gray-500 font-medium bg-transparent border-none focus:outline-none disabled:opacity-50"
    >
      {SUPPORTED_LOCALES.map((locale) => (
        <option key={locale} value={locale}>
          {LOCALE_LABELS[locale]}
        </option>
      ))}
    </select>
  )
}
