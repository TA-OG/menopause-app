'use client'

/**
 * /auth/complete — finishes a sign-in whose session arrived in the URL
 * fragment.
 *
 * Supabase's default email templates send the invitee to its own verify
 * endpoint, which redirects back with `#access_token=…&refresh_token=…`.
 * Browsers never transmit a fragment to the server, so /auth/callback cannot
 * see those tokens; it forwards here, and the fragment rides along because the
 * redirect carries none of its own.
 *
 * This page reads them, establishes the session, then asks the server to run
 * the same post-sign-in work every other route runs — claiming a referral and
 * starting any complimentary premium that has been waiting for a first
 * sign-in. Without that last step an invited woman would land in the app on
 * the free tier and hit a paywall she was promised she would not see.
 */

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Logo from '@/components/ui/Logo'

function readFragment(): URLSearchParams {
  const hash = window.location.hash
  return new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
}

export default function AuthCompletePage() {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const bounce = (reason: string) => {
      window.location.replace(`/auth/sign-in?error=${encodeURIComponent(reason)}`)
    }

    const run = async () => {
      const fragment = readFragment()
      const query = new URLSearchParams(window.location.search)

      const providerError = fragment.get('error_description') ?? fragment.get('error')
      if (providerError) return bounce(providerError)

      const accessToken = fragment.get('access_token')
      const refreshToken = fragment.get('refresh_token')

      // No tokens and no error means this was not a sign-in redirect at all.
      if (!accessToken || !refreshToken) return bounce('auth_callback_failed')

      const supabase = createClient()
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })
      if (error) return bounce('auth_callback_failed')

      // Session cookies are written now, so the server can identify the user.
      let redirectTo = query.get('next') ?? '/dashboard'
      try {
        const res = await fetch('/api/auth/complete-signin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ next: query.get('next'), ref: query.get('ref') }),
        })
        const body = await res.json()
        if (res.ok && typeof body?.redirectTo === 'string') redirectTo = body.redirectTo
      } catch {
        // They are signed in either way — carry on into the app rather than
        // blocking on follow-up work that also retries at the next sign-in.
      }

      // replace(), not assign(): the tokens must not be left in history.
      window.location.replace(redirectTo)
    }

    run().catch(() => setFailed(true))
  }, [])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
      <Logo />
      {failed ? (
        <>
          <p className="text-sm text-brand-900">We could not finish signing you in.</p>
          <a href="/auth/sign-in" className="text-sm text-brand-600 underline">
            Try again
          </a>
        </>
      ) : (
        <p className="text-sm text-gray-500">Signing you in…</p>
      )}
    </div>
  )
}
