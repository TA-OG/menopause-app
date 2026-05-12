'use client'

import { createClient } from '@/lib/supabase/client'

export function GoogleSignInButton({ className }: { className?: string }) {
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
