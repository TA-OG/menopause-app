'use client'

import { useState } from 'react'

interface Props {
  waitlistId: string
  email: string
  firstName: string
}

interface ComplimentaryResult {
  status: 'granted' | 'already_subscribed' | 'failed'
  months: number
  expiresAt: string | null
  error: string | null
}

export default function InviteButton({ waitlistId, email, firstName }: Props) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'warning' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function invite() {
    if (
      !confirm(
        `Send a sign-up invite to ${firstName} (${email})?\n\n` +
          'They will also receive 12 months of complimentary premium.',
      )
    ) {
      return
    }

    setState('loading')
    try {
      const res = await fetch('/api/admin/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ waitlistId, email, firstName }),
      })
      const json = await res.json()

      if (!res.ok) {
        setState('error')
        setMessage(json.error ?? 'Failed')
        return
      }

      // The invite email has been sent either way. What varies is whether the
      // complimentary premium actually landed — a silent failure here would
      // leave her hitting a paywall she was told she would not see, so it is
      // surfaced right where the invite was sent, not just in the log.
      const comp = json.complimentary as ComplimentaryResult | undefined

      if (comp?.status === 'granted') {
        setState('done')
        setMessage(`Invited ✓ · ${comp.months}m premium`)
      } else if (comp?.status === 'already_subscribed') {
        setState('done')
        setMessage('Invited ✓ · already subscribed')
      } else {
        setState('warning')
        setMessage(comp?.error ?? 'Complimentary premium was not applied')
      }
    } catch {
      setState('error')
      setMessage('Network error')
    }
  }

  if (state === 'done') {
    return <span className="text-xs text-green-600 font-medium whitespace-nowrap">{message}</span>
  }

  if (state === 'warning') {
    return (
      <span className="text-xs text-amber-600 font-medium" title={message}>
        Invited, no premium ⚠
      </span>
    )
  }

  if (state === 'error') {
    return <span className="text-xs text-red-600" title={message}>Error — retry?</span>
  }

  return (
    <button
      onClick={invite}
      disabled={state === 'loading'}
      className="text-xs bg-brand-900 text-white px-3 py-1.5 rounded-lg hover:bg-brand-800 transition-colors disabled:opacity-50 whitespace-nowrap"
    >
      {state === 'loading' ? 'Sending…' : 'Invite →'}
    </button>
  )
}
