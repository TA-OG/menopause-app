'use client'

import { useState } from 'react'
import { resendNotice, type InviteNotice } from '@/lib/invite-notice'
import type { InviteEmailRecordStatus } from '@/lib/complimentary-premium-config'

interface Props {
  inviteId: string
  email: string
  firstName: string | null
  /** The delivery outcome of this row — decides how loud the button is. */
  emailStatus: InviteEmailRecordStatus
  /** Reload the invite log so the banners and badges reflect the resend. */
  onDone: () => void
}

/**
 * "Send again" — resend someone their link into the app from the invite log.
 *
 * This is the only place an already-invited person can be emailed again: the
 * waitlist's Invite button disappears once a row is marked converted, which is
 * every invited person by definition. Anyone whose email never arrived was
 * therefore unreachable from the admin panel entirely.
 *
 * Styled by outcome rather than uniformly — a row that reached nobody gets a
 * solid red button, because that is the one an admin is looking for; the rest
 * get a quiet link, so a resend to someone who is fine stays a deliberate act.
 */
export default function ResendInviteButton({
  inviteId,
  email,
  firstName,
  emailStatus,
  onDone,
}: Props) {
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState<InviteNotice | null>(null)

  const neverArrived = emailStatus === 'not_sent' || emailStatus === 'unknown'
  const who = firstName ? `${firstName} (${email})` : email

  async function resend() {
    if (
      !confirm(
        `Send ${who} their link into Aunty Mel again?\n\n` +
          'They will get a fresh sign-in link by email. Their complimentary ' +
          'premium is not affected — an existing grant is left exactly as it is.',
      )
    ) {
      return
    }

    setSending(true)
    setNotice(null)
    try {
      const res = await fetch('/api/admin/invites/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteId }),
      })
      const json = await res.json()

      if (!res.ok) {
        setNotice({ tone: 'warn', text: json.error ?? 'Could not resend the invite' })
        return
      }

      // Never inferred from the HTTP status: the route answers 200 for a send
      // that failed but was recorded, which is exactly the case that must not
      // be reported as success.
      setNotice(
        resendNotice({
          email: json.email ?? email,
          emailDelivery: json.emailDelivery,
          complimentary: json.complimentary,
        }),
      )

      // Refresh regardless of the delivery outcome — a failed attempt is still
      // a new row in the log, and the badges should show it.
      onDone()
    } catch {
      setNotice({ tone: 'warn', text: 'Network error — nothing was sent.' })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="text-right">
      <button
        onClick={resend}
        disabled={sending}
        className={
          neverArrived
            ? 'text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 whitespace-nowrap'
            : 'text-xs text-brand-600 hover:text-brand-800 hover:underline transition-colors disabled:opacity-50 whitespace-nowrap'
        }
      >
        {sending ? 'Sending…' : 'Send again'}
      </button>

      {notice && (
        <p
          className={`text-[11px] mt-1 max-w-xs ml-auto ${
            notice.tone === 'warn' ? 'text-red-600 font-medium' : 'text-green-700'
          }`}
        >
          {notice.text}
        </p>
      )}
    </div>
  )
}
