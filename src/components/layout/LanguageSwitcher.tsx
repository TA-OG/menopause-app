'use client'

import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { LOCALE_LABELS, SUPPORTED_LOCALES, type Locale } from '@/lib/locale-geo-map'
import { setLocale } from '@/lib/set-locale'

export default function LanguageSwitcher({ currentLocale }: { currentLocale: Locale }) {
  const t = useTranslations('LanguageSwitcher')
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [refreshing, startTransition] = useTransition()

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const locale = e.target.value
    setSaving(true)
    try {
      await setLocale(locale)
      startTransition(() => router.refresh())
    } catch (err) {
      // The select snaps back to currentLocale on the next render, which is
      // the honest state: the language did not change.
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <select
      // Native language names must never be auto-translated by the browser.
      translate="no"
      aria-label={t('label')}
      value={currentLocale}
      onChange={handleChange}
      disabled={saving || refreshing}
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
