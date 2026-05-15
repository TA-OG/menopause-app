'use client'

import { useState } from 'react'

interface Props {
  waitlistId: string
  email: string
  firstName: string
}

export default function InviteButton({ waitlistId, email, firstName }: Props) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function invite() {
    if (!confirm(`Send a sign-up invite to ${firstName} (${email})?`)) return

    setState('loading')
    try {
      const res = await fetch('/api/admin/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ waitlistId, email, firstName }),
      })
      const json = await res.json()
      if (res.ok) {
        setState('done')
        setMessage('Invited ✓')
      } else {
        setState('error')
        setMessage(json.error ?? 'Failed')
      }
    } catch {
      setState('error')
      setMessage('Network error')
    }
  }

  if (state === 'done') {
    return <span className="text-xs text-green-600 font-medium">{message}</span>
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
