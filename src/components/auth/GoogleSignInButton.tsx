'use client'

/**
 * Reusable Google Sign-In button component.
 *
 * Initiates a Google OAuth flow via Supabase Auth. The redirect URL points
 * to /auth/callback, which exchanges the OAuth code for a Supabase session.
 *
 * Uses 'offline' access_type for a refresh token and 'consent' prompt to
 * ensure Google always shows the consent screen — required for reliable
 * token refresh in long-lived sessions.
 *
 * The Supabase client is created lazily inside the click handler to prevent
 * issues during Next.js static prerendering.
 */

import { createClient } from '@/lib/supabase/client'

export function GoogleSignInButton({ className }: { className?: string }) {
  /** Initiate Google OAuth via Supabase, redirecting to /auth/callback. */
  const handleSignIn = async () => {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    })
  }

  return (
    <button onClick={handleSignIn} className={className}>
      Continue with Google
    </button>
  )
}
