'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Manual fallback for the case where a user has paid but the app still
 * shows them as free tier (e.g. the Stripe webhook was delayed, failed, or
 * — before migration 023 — silently dropped the update). Re-derives the
 * subscription status straight from Stripe via /api/stripe/sync-subscription.
 */
export default function RefreshSubscriptionButton() {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'checking' | 'still-free' | 'error'>('idle')

  async function handleClick() {
    setState('checking')
    try {
      const res = await fetch('/api/stripe/sync-subscription', { method: 'POST' })
      if (!res.ok) {
        setState('error')
        return
      }
      const data = await res.json()
      if (data.tier === 'premium') {
        router.refresh()
      } else {
        setState('still-free')
      }
    } catch {
      setState('error')
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={handleClick}
        disabled={state === 'checking'}
        className="text-blush-700 text-sm font-medium underline disabled:opacity-50"
      >
        {state === 'checking' ? 'Checking with Stripe…' : 'Already paid? Refresh status'}
      </button>
      {state === 'still-free' && (
        <p className="text-xs text-blush-600">
          We couldn&apos;t find an active subscription yet. If you were just charged, this can
          take a minute — try again shortly, or contact support if it persists.
        </p>
      )}
      {state === 'error' && (
        <p className="text-xs text-blush-600">Something went wrong. Please try again.</p>
      )}
    </div>
  )
}
