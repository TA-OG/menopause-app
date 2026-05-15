'use client'

import { useState } from 'react'

const PRICES = {
  gbp: {
    monthly: { display: '£7.99', sub: 'per month', priceId: 'monthly' },
    yearly:  { display: '£65.79', sub: '£5.48/mo — save £30 a year', priceId: 'yearly' },
  },
  // USD pricing not yet enabled — re-introduce the currency toggle once
  // STRIPE_PRICE_USD_MONTHLY and STRIPE_PRICE_USD_YEARLY are configured in Vercel.
  usd: {
    monthly: { display: '$9.99', sub: 'per month', priceId: 'monthly' },
    yearly:  { display: '$79.99', sub: '$6.67/mo — save $40 a year', priceId: 'yearly' },
  },
}

export default function PayPage() {
  const [loading, setLoading]   = useState(false)
  // Currency hardcoded to GBP for now — see PRICES note above
  const currency: 'gbp' | 'usd' = 'gbp'
  const [interval, setInterval] = useState<'monthly' | 'yearly'>('yearly')
  const [error, setError]       = useState('')

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
        setError(apiError ?? 'Something went wrong. Please try again.')
        setLoading(false)
      }
    } catch {
      setError('Could not connect. Please check your connection and try again.')
      setLoading(false)
    }
  }

  const selected = PRICES[currency][interval]

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 to-white flex items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-6">

        <div className="text-center">
          <div className="text-5xl mb-3">✨</div>
          <h1 className="text-2xl font-bold text-brand-900">Unlock Premium</h1>
          <p className="text-gray-500 mt-2 text-sm">
            Your full personalised wellness plan, complete content library, and unlimited journal.
          </p>
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
            Monthly
          </button>
          <button
            onClick={() => setInterval('yearly')}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              interval === 'yearly'
                ? 'bg-brand-900 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            Yearly
            {interval !== 'yearly' && (
              <span className="ml-1.5 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">
                Save 31%
              </span>
            )}
          </button>
        </div>

        {/* Price display */}
        <div className="text-center py-2">
          <p className="text-4xl font-bold text-brand-900">{selected.display}</p>
          <p className="text-sm text-gray-500 mt-1">{selected.sub}</p>
        </div>

        {/* What's included */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm space-y-3">
          {[
            'Full personalised wellness plan',
            'All diet, lifestyle & mindset recommendations',
            'Supplement guidance with evidence notes',
            'Complete Pamela content library',
            'Unlimited journal history',
            'Daily symptom trend insights',
            'Push notification daily nudges',
          ].map((item) => (
            <div key={item} className="flex items-start gap-3">
              <span className="text-brand-600 mt-0.5">✓</span>
              <span className="text-sm text-gray-700">{item}</span>
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
          {loading ? 'Loading…' : `Start for ${selected.display}${interval === 'monthly' ? '/month' : '/year'}`}
        </button>

        <p className="text-xs text-center text-gray-400">
          Cancel anytime. No hidden fees. Secure payment via Stripe.
        </p>

      </div>
    </div>
  )
}
