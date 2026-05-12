'use client'

/**
 * Sign-up page — new user registration with consent collection.
 *
 * Collects GDPR-compliant consent (terms, data processing, optional marketing)
 * before allowing authentication via Google OAuth or email magic link.
 *
 * The Supabase client is created lazily inside event handlers to prevent
 * Next.js static prerendering from crashing when env vars are unavailable
 * during the Vercel build phase.
 */

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { DISCLAIMER } from '@/lib/disclaimer'

// ─── Google logo SVG paths (brand-compliant colours) ─────────────────────────

const GOOGLE_LOGO_PATHS = [
  { fill: '#4285F4', d: 'M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z' },
  { fill: '#34A853', d: 'M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z' },
  { fill: '#FBBC05', d: 'M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z' },
  { fill: '#EA4335', d: 'M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z' },
] as const

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      {GOOGLE_LOGO_PATHS.map(({ fill, d }) => (
        <path key={fill} fill={fill} d={d} />
      ))}
    </svg>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function SignUpPage() {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [consentData, setConsentData] = useState(false)
  const [consentMarketing, setConsentMarketing] = useState(false)
  const [consentTerms, setConsentTerms] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  /** Both required consents must be accepted before any auth action. */
  const consentReady = consentTerms && consentData

  /**
   * Initiate Google OAuth sign-up. Consent checkboxes are validated
   * client-side before initiating the OAuth flow.
   */
  async function handleGoogle() {
    if (!consentReady) {
      setError('Please accept the required terms before continuing.')
      return
    }

    setGoogleLoading(true)
    setError('')

    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    })

    if (authError) {
      setError(authError.message)
      setGoogleLoading(false)
    }
  }

  /**
   * Send a magic link for email-based sign-up. User metadata (name, consent
   * flags) is attached to the OTP request and stored in Supabase Auth on
   * first sign-in, making it available via auth.getUser() afterwards.
   */
  async function handleEmailSignUp(e: React.FormEvent) {
    e.preventDefault()

    if (!consentReady) {
      setError('Please accept the required terms to continue.')
      return
    }

    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        data: {
          full_name: name,
          consent_data: consentData,
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

  // ── Magic-link confirmation screen ─────────────────────────────────────────

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 bg-cream">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">📧</div>
          <h1 className="text-2xl font-bold text-brand-900 mb-2">
            Check your email
          </h1>
          <p className="text-gray-600 text-sm">
            Magic link sent to <strong>{email}</strong>. Click it to continue.
          </p>
          <button
            onClick={() => setSent(false)}
            className="text-sm text-brand-700 underline mt-4"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  // ── Main sign-up form ──────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">🌸</div>
          <h1 className="text-3xl font-bold text-brand-900">Get started free</h1>
          <p className="text-gray-500 mt-2 text-sm">
            Your personalised wellness plan is waiting.
          </p>
        </div>

        {/* ── Consent checkboxes — shown before any auth action ─────────── */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100 space-y-3 mb-5">
          <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">
            Before you continue
          </p>

          {/* Required: Terms of Service */}
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

          {/* Required: Data processing consent */}
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={consentData}
              onChange={(e) => setConsentData(e.target.checked)}
              className="mt-0.5 accent-brand-700"
            />
            <span className="text-sm text-gray-700">
              I consent to my wellness data being processed to personalise my experience.
              {' '}<span className="text-red-500">*</span>
            </span>
          </label>

          {/* Optional: Marketing emails */}
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={consentMarketing}
              onChange={(e) => setConsentMarketing(e.target.checked)}
              className="mt-0.5 accent-brand-700"
            />
            <span className="text-sm text-gray-700">
              Send me wellness tips by email. (Optional)
            </span>
          </label>
        </div>

        {/* Google OAuth button */}
        <button
          onClick={handleGoogle}
          disabled={googleLoading || !consentReady}
          className="w-full flex items-center justify-center gap-3 border border-gray-200 bg-white text-gray-700 font-medium py-3 rounded-2xl hover:bg-gray-50 transition-colors disabled:opacity-40 mb-4"
        >
          <GoogleIcon />
          {googleLoading ? 'Connecting...' : 'Continue with Google'}
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400">or use email</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* Email sign-up form */}
        <form onSubmit={handleEmailSignUp} className="space-y-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your first name"
            required
            className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            required
            className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
          />

          {error && (
            <p className="text-red-600 text-sm bg-red-50 rounded-xl px-4 py-2">
              {error}
            </p>
          )}

          {/* Medical disclaimer — required for health-related apps */}
          <p className="text-xs text-gray-400 leading-relaxed">
            {DISCLAIMER.short}
          </p>

          <button
            type="submit"
            disabled={loading || !consentReady}
            className="w-full bg-brand-900 text-white font-semibold py-3 rounded-2xl hover:bg-brand-800 transition-colors disabled:opacity-40"
          >
            {loading ? 'Sending link...' : 'Continue with email'}
          </button>
        </form>

        {/* Sign-in link */}
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
