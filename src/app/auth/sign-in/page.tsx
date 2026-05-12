'use client'

/**
 * Sign-in page — passwordless authentication via magic link or Google OAuth.
 *
 * The Supabase client is created lazily inside event handlers (not at render
 * time) so that Next.js static prerendering doesn't crash when env vars are
 * unavailable during the build phase on Vercel.
 */

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

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

export default function SignInPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  /**
   * Send a passwordless magic link to the user's email via Supabase Auth.
   * The redirect URL points to our /auth/callback route which exchanges
   * the code for a session.
   */
  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: {
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

  /**
   * Initiate Google OAuth sign-in. Uses 'offline' access_type to obtain a
   * refresh token and 'consent' prompt to ensure the user always sees the
   * Google consent screen (required for reliable token refresh).
   */
  async function handleGoogle() {
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

  // ── Magic-link confirmation screen ─────────────────────────────────────────

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 bg-gradient-to-b from-brand-50 to-white">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">📧</div>
          <h1 className="text-2xl font-bold text-brand-900 mb-2">
            Check your email
          </h1>
          <p className="text-gray-600 text-sm">
            Magic link sent to <strong>{email}</strong>.
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

  // ── Main sign-in form ──────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 to-white flex items-center justify-center px-6">
      <div className="w-full max-w-sm">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">🌸</div>
          <h1 className="text-3xl font-bold text-brand-900">Welcome back</h1>
          <p className="text-gray-500 mt-2 text-sm">
            Sign in to your wellness plan.
          </p>
        </div>

        {/* Google OAuth button */}
        <button
          onClick={handleGoogle}
          disabled={googleLoading}
          className="w-full flex items-center justify-center gap-3 border border-gray-200 bg-white text-gray-700 font-medium py-3 rounded-2xl hover:bg-gray-50 transition-colors disabled:opacity-50 mb-4"
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

        {/* Email magic link form */}
        <form onSubmit={handleMagicLink} className="space-y-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="your@email.com"
            className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
          />

          {error && (
            <p className="text-red-600 text-sm bg-red-50 rounded-xl px-4 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-900 text-white font-semibold py-3 rounded-2xl hover:bg-brand-800 transition-colors disabled:opacity-50"
          >
            {loading ? 'Sending...' : 'Send magic link'}
          </button>
        </form>

        {/* Sign-up link */}
        <p className="text-center text-sm text-gray-500 mt-6">
          No account?{' '}
          <Link href="/auth/sign-up" className="text-brand-700 font-medium">
            Sign up free
          </Link>
        </p>
      </div>
    </div>
  )
}
