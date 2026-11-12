'use client'

import { Sparkles } from 'lucide-react'
import IconBadge from '@/components/ui/IconBadge'
import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'

// Amounts, not display strings: each locale formats its own currency
// ("£7.99" in English, "7,99 £" in French/German). Copy lives in Pay messages.
const PRICES = {
  gbp: {
    monthly: { amount: 7.99, priceId: 'monthly' },
    yearly: { amount: 65.79, perMonth: 5.48, saving: 30, priceId: 'yearly' },
  },
  // USD pricing not yet enabled — re-introduce the currency toggle once
  // STRIPE_PRICE_USD_MONTHLY and STRIPE_PRICE_USD_YEARLY are configured in Vercel.
  usd: {
    monthly: { amount: 9.99, priceId: 'monthly' },
    yearly: { amount: 79.99, perMonth: 6.67, saving: 40, priceId: 'yearly' },
  },
}

const FEATURE_KEYS = [
  'featurePlan',
  'featureRecommendations',
  'featureSupplements',
  'featureArticles',
  'featureJournal',
  'featureTrends',
  'featureNudges',
] as const

export default function PayPage() {
  const t = useTranslations('Pay')
  const locale = useLocale()
  const [loading, setLoading] = useState(false)
  // Currency hardcoded to GBP for now — see PRICES note above
  const currency: 'gbp' | 'usd' = 'gbp'
  const [interval, setInterval] = useState<'monthly' | 'yearly'>('yearly')
  const [error, setError] = useState('')

  const money = (amount: number) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount)

  async function startCheckout() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currency, interval }),
      })
      const { url, error: apiError } = await res.json()
      if (url) {
        window.location.href = url
      } else {
        // The API's message is English: log it, show hers.
        console.error('checkout failed:', res.status, apiError)
        setError(t('errorGeneric'))
        setLoading(false)
      }
    } catch {
      setError(t('errorNetwork'))
      setLoading(false)
    }
  }

  const monthly = PRICES[currency].monthly
  const yearly = PRICES[currency].yearly
  const display = money(interval === 'monthly' ? monthly.amount : yearly.amount)
  const sub =
    interval === 'monthly'
      ? t('perMonth')
      : t('yearlySub', { perMonth: money(yearly.perMonth), saving: money(yearly.saving) })

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 to-white flex items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-6">

        <div className="text-center">
          <IconBadge icon={Sparkles} />
          <h1 className="text-2xl font-bold text-brand-900">{t('title')}</h1>
          <p className="text-gray-500 mt-2 text-sm">{t('subtitle')}</p>
        </div>

        {/* Billing interval toggle */}
        <div className="flex rounded-xl border border-gray-200 overflow-hidden">
          <button
            onClick={() => setInterval('monthly')}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              interval === 'monthly'
                ? 'bg-brand-900 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {t('monthly')}
          </button>
          <button
            onClick={() => setInterval('yearly')}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              interval === 'yearly'
                ? 'bg-brand-900 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {t('yearly')}
            {interval !== 'yearly' && (
              <span className="ml-1.5 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">
                {t('savePercent', { percent: 31 })}
              </span>
            )}
          </button>
        </div>

        {/* Price display */}
        <div className="text-center py-2">
          <p className="text-4xl font-bold text-brand-900">{display}</p>
          <p className="text-sm text-gray-500 mt-1">{sub}</p>
        </div>

        {/* What's included */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm space-y-3">
          {FEATURE_KEYS.map((key) => (
            <div key={key} className="flex items-start gap-3">
              <span className="text-brand-700 mt-0.5">✓</span>
              <span className="text-sm text-gray-700">{t(key)}</span>
            </div>
          ))}
        </div>

        {/* Currency toggle hidden until USD prices are configured — see PRICES note above */}

        {error && (
          <p className="text-red-600 text-sm bg-red-50 rounded-xl px-4 py-3 text-center">
            {error}
          </p>
        )}

        <button
          onClick={startCheckout}
          disabled={loading}
          className="w-full bg-brand-900 text-white font-semibold py-4 rounded-2xl text-lg hover:bg-brand-800 transition-colors disabled:opacity-50"
        >
          {loading
            ? t('loading')
            : interval === 'monthly'
              ? t('startMonthly', { price: display })
              : t('startYearly', { price: display })}
        </button>

        <p className="text-xs text-center text-gray-600">{t('reassurance')}</p>

      </div>
    </div>
  )
}
