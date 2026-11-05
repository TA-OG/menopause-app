'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

interface ReferralStats {
  referralCode: string
  referralUrl: string
  referredCount: number
  monthsEarned: number
  monthsBanked: number
  capMonths: number
  capReached: boolean
}

export default function ReferralCard() {
  const t = useTranslations('ReferralCard')
  const [stats, setStats] = useState<ReferralStats | null>(null)
  const [error, setError] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch('/api/referral/me')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load referral stats')
        return res.json()
      })
      .then(setStats)
      .catch(() => setError(true))
  }, [])

  async function copyLink() {
    if (!stats) return
    try {
      await navigator.clipboard.writeText(stats.referralUrl)
    } catch {
      const input = document.createElement('input')
      input.value = stats.referralUrl
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 text-sm text-gray-500">
        {t('loadError')}
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 animate-pulse">
        <div className="h-4 bg-gray-100 rounded w-2/3 mb-3" />
        <div className="h-10 bg-gray-100 rounded-xl" />
      </div>
    )
  }

  const shareText = t('shareText', { url: stats.referralUrl })

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
      <div>
        <h2 className="font-bold text-brand-900">{t('title')}</h2>
        <p className="text-sm text-gray-500 mt-1 leading-relaxed">
          {t.rich('body', { cap: stats.capMonths, strong: (chunks) => <strong>{chunks}</strong> })}
        </p>
      </div>

      {/* Progress */}
      <div>
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
          <span>{t('progress', { earned: stats.monthsEarned, cap: stats.capMonths })}</span>
          {stats.capReached && <span className="text-brand-700 font-semibold">{t('capReached')}</span>}
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-600 rounded-full transition-all"
            style={{ width: `${Math.min(100, (stats.monthsEarned / stats.capMonths) * 100)}%` }}
          />
        </div>
        {stats.monthsBanked > 0 && (
          <p className="text-xs text-gray-400 mt-2">
            {t('banked', { count: stats.monthsBanked })}
          </p>
        )}
      </div>

      {/* Link */}
      <div className="bg-brand-50 rounded-xl p-3">
        <p className="text-xs text-gray-500 mb-1">{t('linkLabel')}</p>
        <p className="text-xs font-mono text-brand-900 break-all leading-relaxed">
          {stats.referralUrl}
        </p>
      </div>

      <button
        onClick={copyLink}
        className="w-full bg-brand-900 text-white font-semibold py-3 rounded-xl text-sm transition-colors hover:bg-brand-800"
      >
        {copied ? t('copied') : t('copy')}
      </button>

      <div className="flex gap-2">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-2 bg-green-500 text-white text-sm font-medium py-2 rounded-xl hover:bg-green-600 transition-colors"
        >
          WhatsApp
        </a>
        <a
          href={`mailto:?subject=${encodeURIComponent(t('emailSubject'))}&body=${encodeURIComponent(shareText)}`}
          className="flex-1 flex items-center justify-center gap-2 bg-gray-700 text-white text-sm font-medium py-2 rounded-xl hover:bg-gray-800 transition-colors"
        >
          {t('email')}
        </a>
      </div>

      <p className="text-xs text-gray-400 leading-relaxed">
        {t.rich('terms', { link: (chunks) => <a href="/terms#referrals" className="underline">{chunks}</a> })}
      </p>
    </div>
  )
}
