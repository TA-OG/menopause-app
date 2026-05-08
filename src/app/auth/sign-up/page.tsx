'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { DISCLAIMER } from '@/lib/disclaimer'

export default function SignUpPage() {
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [consentData, setConsentData] = useState(false)
  const [consentMarketing, setConsentMarketing] = useState(false)
  const [consentTerms, setConsentTerms] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    if (!consentTerms || !consentData) {
      setError('Please accept the required terms to continue.')
      return
    }

    setLoading(true)
    setError('')

    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        data: {
          full_name: name,
          consent_data_processing: consentData,
          consent_marketing: consentMarketing,
          consent_terms: consentTerms,
        },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
    } else {
      setSent(true)
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">📧</div>
          <h1 className="text-2xl font-bold text-brand-900 mb-2">Check your email</h1>
          <p className="text-gray-600">
            We&apos;ve sent a magic link to <strong>{email}</strong>. Click it to sign in.
          </p>
          <p className="text-sm text-gray-400 mt-4">
            No email? Check your spam folder.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 to-white flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-brand-900">Get started free</h1>
          <p className="text-gray-500 mt-2">
            Your personalised wellness plan is waiting.
          </p>
        </div>

        <form onSubmit={handleSignUp} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">
              Your name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="First name"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">
              Email address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
            />
          </div>

          {/* GDPR consent — required */}
          <div className="space-y-3 bg-white rounded-xl p-4 border border-gray-100">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
              Your permissions
            </p>

            {/* Terms — required */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={consentTerms}
                onChange={(e) => setConsentTerms(e.target.checked)}
                className="mt-0.5 accent-brand-700"
              />
              <span className="text-sm text-gray-700">
                I agree to the{' '}
                <Link href="/terms" className="text-brand-700 underline">Terms of Service</Link>
                {' '}and{' '}
                <Link href="/privacy" className="text-brand-700 underline">Privacy Policy</Link>.
                {' '}<span className="text-red-500">*</span>
              </span>
            </label>

            {/* Data processing — required */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={consentData}
                onChange={(e) => setConsentData(e.target.checked)}
                className="mt-0.5 accent-brand-700"
              />
              <span className="text-sm text-gray-700">
                I consent to my wellness data (symptoms, lifestyle, journal entries)
                being processed to personalise my experience.{' '}
                <span className="text-red-500">*</span>
              </span>
            </label>

            {/* Marketing — optional */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={consentMarketing}
                onChange={(e) => setConsentMarketing(e.target.checked)}
                className="mt-0.5 accent-brand-700"
              />
              <span className="text-sm text-gray-700">
                I&apos;d like to receive wellness tips and updates by email. (Optional)
              </span>
            </label>
          </div>

          {/* Wellness disclaimer */}
          <p className="text-xs text-gray-400 leading-relaxed">
            {DISCLAIMER.short}
          </p>

          {error && (
            <p className="text-red-600 text-sm bg-red-50 rounded-xl px-4 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !consentTerms || !consentData}
            className="w-full bg-brand-900 text-white font-semibold py-3 rounded-xl hover:bg-brand-800 transition-colors disabled:opacity-50"
          >
            {loading ? 'Sending link...' : 'Continue with email'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          Already have an account?{' '}
          <Link href="/auth/sign-in" className="text-brand-700 font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
