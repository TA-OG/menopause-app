'use client'

import { useState } from 'react'

export default function PayPage() {
  const [loading, setLoading] = useState(false)
  const [currency, setCurrency] = useState<'gbp' | 'usd'>('gbp')

  async function startCheckout() {
    setLoading(true)
    const res = await fetch('/api/stripe/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currency }),
    })
    const { url, error } = await res.json()
    if (url) {
      window.location.href = url
    } else {
      console.error(error)
      setLoading(false)
    }
  }

  const price = currency === 'gbp' ? '£7.99' : '$9.99'

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 to-white flex items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="text-5xl mb-3">✨</div>
          <h1 className="text-2xl font-bold text-brand-900">Unlock Premium</h1>
          <p className="text-gray-500 mt-2 text-sm">
            Get your full personalised wellness plan and complete content library.
          </p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm space-y-3">
          {[
            'Full personalised wellness plan',
            'All diet, lifestyle, and mindset recommendations',
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

        {/* Currency toggle */}
        <div className="flex rounded-xl border border-gray-200 overflow-hidden">
          <button
            onClick={() => setCurrency('gbp')}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              currency === 'gbp'
                ? 'bg-brand-900 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            £ GBP
          </button>
          <button
            onClick={() => setCurrency('usd')}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              currency === 'usd'
                ? 'bg-brand-900 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            $ USD
          </button>
        </div>

        <button
          onClick={startCheckout}
          disabled={loading}
          className="w-full bg-brand-900 text-white font-semibold py-4 rounded-2xl text-lg hover:bg-brand-800 transition-colors disabled:opacity-50"
        >
          {loading ? 'Loading...' : `Start for ${price}/month`}
        </button>

        <p className="text-xs text-center text-gray-400">
          Cancel anytime. No hidden fees.
          Secure payment via Stripe.
        </p>
      </div>
    </div>
  )
}
