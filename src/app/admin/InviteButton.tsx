'use client'

import { useState } from 'react'
import type { ComplimentaryStatus } from '@/lib/complimentary-premium-config'

interface Props {
  waitlistId: string
  email: string
  firstName: string
}

interface ComplimentaryResult {
  status: ComplimentaryStatus
  months: number
  error: string | null
}

interface EmailDelivery {
  status: 'invite_sent' | 'magic_link_sent' | 'not_sent'
  failed: boolean
  error: string | null
}

export default function InviteButton({ waitlistId, email, firstName }: Props) {
  const [state, setState] = useState<
    'idle' | 'loading' | 'done' | 'warning' | 'no_email' | 'error'
  >('idle')
  const [message, setMessage] = useState('')

  async function invite() {
    if (
      !confirm(
        `Send a sign-up invite to ${firstName} (${email})?\n\n` +
          'They will receive 12 months of complimentary premium, starting the ' +
          'first time they sign in.',
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

      // Two things can go wrong independently, and the email is the one that
      // matters most: an admin tells someone by hand that their invite is on
      // the way, so "Invited ✓" over an email that never left is worse than no
      // feedback at all. It is reported first and never inferred — this button
      // previously claimed the email "has been sent either way", which was
      // untrue for anyone who already had an account.
      const delivery = json.emailDelivery as EmailDelivery | undefined
      const comp = json.complimentary as ComplimentaryResult | undefined

      if (delivery?.failed) {
        setState('no_email')
        setMessage(delivery.error ?? 'No email was sent')
        return
      }

      // 'failed' is the only outcome that leaves someone facing a paywall.
      // The rest all mean she is covered, by four different routes, and
      // treating them as warnings would make a re-invite — now the normal way
      // to resend a link — look like it had gone wrong every time.
      if (comp?.status === 'failed') {
        setState('warning')
        setMessage(comp.error ?? 'Complimentary premium was not scheduled')
        return
      }

      setState('done')
      setMessage(
        comp?.status === 'pending_activation'
          ? `Invited ✓ · ${comp.months}m on sign-in`
          : comp?.status === 'granted'
          ? `Invited ✓ · ${comp.months}m premium active`
          : comp?.status === 'already_subscribed'
          ? 'Invited ✓ · already subscribed'
          : comp?.status === 'activating'
          ? `Invited ✓ · ${comp.months}m starting now`
          : // 'not_attempted' — an earlier invite already scheduled her months.
            'Invited ✓ · premium already scheduled',
      )
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

  if (state === 'no_email') {
    return (
      <span className="text-xs text-red-600 font-medium" title={message}>
        No email sent ✗
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
