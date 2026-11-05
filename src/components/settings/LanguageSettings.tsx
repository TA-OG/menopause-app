'use client'

import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { LOCALE_LABELS, SUPPORTED_LOCALES, type Locale } from '@/lib/locale-geo-map'
import { setLocale } from '@/lib/set-locale'

/**
 * Language preference on the profile page. Same mechanism as the NavBar
 * switcher and the quiz's first step: POST /api/locale (cookie + profile),
 * then refresh so every server component re-renders in the new language.
 */
export default function LanguageSettings({ currentLocale }: { currentLocale: Locale }) {
  const t = useTranslations('Profile')
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [refreshing, startTransition] = useTransition()

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const locale = e.target.value
    setSaving(true)
    setStatus('idle')
    try {
      await setLocale(locale)
      setStatus('saved')
      startTransition(() => router.refresh())
    } catch (err) {
      console.error(err)
      setStatus('error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <label htmlFor="language-setting" className="font-semibold text-gray-900 block mb-1">
        {t('languageTitle')}
      </label>
      <p className="text-sm text-gray-500 mb-3">{t('languageBody')}</p>
      <select
        // Native language names must never be auto-translated by the browser.
        translate="no"
        id="language-setting"
        value={currentLocale}
        onChange={handleChange}
        disabled={saving || refreshing}
        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:opacity-50"
      >
        {SUPPORTED_LOCALES.map((locale) => (
          <option key={locale} value={locale}>
            {LOCALE_LABELS[locale]}
          </option>
        ))}
      </select>
      <p role="status" aria-live="polite" className="text-xs mt-2 min-h-[1rem]">
        {status === 'saved' && !refreshing && <span className="text-brand-700">{t('languageSaved')}</span>}
        {status === 'error' && <span className="text-red-600">{t('languageError')}</span>}
      </p>
    </div>
  )
}
