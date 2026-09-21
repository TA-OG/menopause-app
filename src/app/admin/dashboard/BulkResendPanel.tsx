'use client'

import { useMemo, useState } from 'react'
import { latestInvitePerPerson, type ResendCandidateRow, type ResendTarget } from '@/lib/invite-log'
import { resendNotice, type InviteNotice } from '@/lib/invite-notice'
import type { InviteKind, InviteEmailRecordStatus } from '@/lib/complimentary-premium-config'

/**
 * "Resend access links" — email a whole cohort their way back into the app.
 *
 * ── Why this is a separate surface from the invite log ───────────────────────
 *
 * The invite log below is an audit trail of invite *attempts*, and it should
 * stay one: it is how an admin answers "what happened to her invite, and when".
 * Resending is a statement about *people*, and the two counts genuinely differ
 * — the live log holds 21 rows for 11 people.
 *
 * Putting checkboxes on the log's rows would have let an admin tick two rows
 * belonging to the same woman and send her two sign-in links, while the button
 * truthfully said "2 selected". So this panel lists people, deduplicated by
 * latestInvitePerPerson(), and the log stays untouched.
 *
 * ── Why the sending loop lives in the browser ────────────────────────────────
 *
 * Each person is sent through the existing POST /api/admin/invites/resend, one
 * at a time, rather than through a new bulk endpoint. That route is already in
 * production and already gets the hard parts right: it reads the address from
 * the invite log rather than the request, re-runs the complimentary grant
 * idempotently, and records every attempt. A second server-side path through
 * Stripe and Supabase auth would be a copy of it that can drift.
 *
 * Driving the loop here also means no serverless timeout to design around, and
 * an admin watching an irreversible action can see it progress person by person
 * rather than waiting on one long request that might half-succeed in silence.
 */

interface Props {
  /** Every invite attempt, exactly as the log fetched them. */
  rows: readonly ResendCandidateRow[]
  /** Reload the invite log once sending finishes, so badges reflect the resend. */
  onDone: () => void
}

/** What happened to one person in a run. */
interface SendResult {
  inviteId: string
  email: string
  notice: InviteNotice
}

const KIND_LABEL: Record<InviteKind, string> = {
  access_override: 'Access override',
  waitlist: 'Waitlist',
  author: 'Author',
}

/**
 * How this person's last email went, in the few words a decision needs.
 * 'unknown' is folded in with 'not_sent' because both mean the same thing to an
 * admin: nothing is known to have reached her.
 */
function deliveryLabel(status: InviteEmailRecordStatus): string {
  switch (status) {
    case 'invite_sent':
      return 'Invite sent'
    case 'magic_link_sent':
      return 'Link sent'
    case 'not_sent':
      return 'Never arrived'
    default:
      return 'Unknown'
  }
}

function deliveryClass(status: InviteEmailRecordStatus): string {
  return status === 'invite_sent' || status === 'magic_link_sent'
    ? 'bg-green-50 text-green-700'
    : 'bg-red-100 text-red-700'
}

export default function BulkResendPanel({ rows, onDone }: Props) {
  const [kindFilter, setKindFilter] = useState<InviteKind | 'all'>('access_override')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState(false)
  const [sentCount, setSentCount] = useState(0)
  const [results, setResults] = useState<SendResult[]>([])
  /** Set when a run stopped early — currently only the rate limiter does this. */
  const [haltedReason, setHaltedReason] = useState<string | null>(null)

  // One entry per person, newest attempt winning. Recomputed only when the log
  // changes, so ticking a checkbox does not re-collapse 21 rows.
  const people = useMemo(() => latestInvitePerPerson(rows), [rows])

  const visible = useMemo(
    () => (kindFilter === 'all' ? people : people.filter((p) => p.inviteKind === kindFilter)),
    [people, kindFilter],
  )

  const kindCounts = useMemo(() => {
    const counts = new Map<InviteKind, number>()
    for (const p of people) counts.set(p.inviteKind, (counts.get(p.inviteKind) ?? 0) + 1)
    return counts
  }, [people])

  const selectedTargets = useMemo(
    () => visible.filter((p) => selected.has(p.inviteId)),
    [visible, selected],
  )

  const allVisibleSelected = visible.length > 0 && selectedTargets.length === visible.length

  function toggleOne(inviteId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(inviteId)) next.delete(inviteId)
      else next.add(inviteId)
      return next
    })
  }

  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) {
        for (const p of visible) next.delete(p.inviteId)
      } else {
        for (const p of visible) next.add(p.inviteId)
      }
      return next
    })
  }

  async function sendToSelected() {
    const targets = selectedTargets
    if (targets.length === 0) return

    const names = targets
      .slice(0, 10)
      .map((t) => `• ${t.firstName ? `${t.firstName} — ` : ''}${t.email}`)
      .join('\n')
    const andMore = targets.length > 10 ? `\n…and ${targets.length - 10} more` : ''

    if (
      !confirm(
        `Email a fresh sign-in link to ${targets.length} ` +
          `${targets.length === 1 ? 'person' : 'people'}?\n\n${names}${andMore}\n\n` +
          'Each person receives one email. Complimentary premium already granted ' +
          'is left exactly as it is. This cannot be undone once sent.',
      )
    ) {
      return
    }

    setSending(true)
    setResults([])
    setSentCount(0)
    setHaltedReason(null)

    const collected: SendResult[] = []
    // Everyone who got an email, so a second press continues rather than
    // repeats. A partial run is the normal outcome of hitting the rate limit,
    // and re-sending to someone who already received her link is the exact
    // failure this panel exists to prevent.
    const delivered = new Set<string>()

    for (const target of targets) {
      try {
        const res = await fetch('/api/admin/invites/resend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inviteId: target.inviteId }),
        })

        // The shared budget with the single-send button is 30/min. Stopping is
        // the only safe response: continuing would spend the run on requests
        // that are refused, and report failures that never reached Supabase.
        if (res.status === 429) {
          setHaltedReason(
            `Rate limit reached after ${collected.length} of ${targets.length}. ` +
              'Everyone already emailed has been unticked — wait a minute and press send again ' +
              'to continue with the rest.',
          )
          break
        }

        const json = await res.json()

        if (!res.ok) {
          collected.push({
            inviteId: target.inviteId,
            email: target.email,
            notice: { tone: 'warn', text: json.error ?? 'Could not resend the invite' },
          })
          continue
        }

        const notice = resendNotice({
          email: json.email ?? target.email,
          emailDelivery: json.emailDelivery,
          complimentary: json.complimentary,
        })

        // Never inferred from the HTTP status: the route answers 200 for a send
        // that failed but was recorded, and only the delivery field says so.
        if (!json.emailDelivery?.failed) delivered.add(target.inviteId)

        collected.push({ inviteId: target.inviteId, email: target.email, notice })
      } catch {
        collected.push({
          inviteId: target.inviteId,
          email: target.email,
          notice: { tone: 'warn', text: 'Network error — nothing was sent to this person.' },
        })
      } finally {
        setSentCount((n) => n + 1)
        setResults([...collected])
      }
    }

    setResults(collected)
    setSelected((prev) => {
      const next = new Set(prev)
      // Array.from rather than iterating the Set directly: this project's
      // tsconfig targets ES5 without downlevelIteration, matching the note in
      // src/lib/invite-log.ts.
      Array.from(delivered).forEach((id) => next.delete(id))
      return next
    })
    setSending(false)

    // Refresh regardless of outcome — a failed attempt is still a new row in
    // the log, and the badges below should show it.
    onDone()
  }

  const failures = results.filter((r) => r.notice.tone === 'warn')

  // scroll-mt keeps the heading clear of the sticky admin chrome when the card
  // is reached by the /admin deep link rather than by scrolling to it.
  return (
    <section
      id="invited-users"
      className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden scroll-mt-24"
    >
      <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-brand-900">Resend access links</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Email people their way back into the app — one email each, however many times
            they have been invited before. Any complimentary premium they already have is
            left untouched.
          </p>
        </div>
        <p className="text-xs text-gray-400 shrink-0 text-right">
          {people.length} {people.length === 1 ? 'person' : 'people'}
          <span className="text-gray-300"> · {rows.length} invite attempts</span>
        </p>
      </div>

      {/* Cohort filter. Defaults to access overrides because that is how every
          tester and beta pilot is stood up — see migration 033. */}
      <div className="px-6 pt-4 flex flex-wrap items-center gap-2">
        {(['access_override', 'waitlist', 'author', 'all'] as const).map((kind) => {
          const count = kind === 'all' ? people.length : kindCounts.get(kind) ?? 0
          const active = kindFilter === kind
          return (
            <button
              key={kind}
              onClick={() => setKindFilter(kind)}
              disabled={sending}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
                active
                  ? 'bg-brand-900 text-white border-brand-900'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {kind === 'all' ? 'Everyone' : KIND_LABEL[kind]}
              <span className={active ? 'text-white/70' : 'text-gray-400'}> · {count}</span>
            </button>
          )
        })}
      </div>

      {visible.length === 0 ? (
        <p className="px-6 py-10 text-center text-sm text-gray-400">
          Nobody in this group yet.
        </p>
      ) : (
        <>
          <div className="px-6 mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wider">
                  <th className="px-3 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleAllVisible}
                      disabled={sending}
                      aria-label="Select everyone shown"
                      className="rounded border-gray-300"
                    />
                  </th>
                  <th className="px-3 py-3">Name</th>
                  <th className="px-3 py-3">Email</th>
                  <th className="px-3 py-3">Type</th>
                  <th className="px-3 py-3">Last email</th>
                  <th className="px-3 py-3">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {visible.map((person: ResendTarget) => {
                  const result = results.find((r) => r.inviteId === person.inviteId)
                  return (
                    <tr key={person.inviteId} className="hover:bg-gray-50">
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(person.inviteId)}
                          onChange={() => toggleOne(person.inviteId)}
                          disabled={sending}
                          aria-label={`Select ${person.email}`}
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="px-3 py-3 font-medium text-brand-900">
                        {person.firstName ?? '—'}
                      </td>
                      <td className="px-3 py-3 text-gray-600 break-all">{person.email}</td>
                      <td className="px-3 py-3 text-gray-500 whitespace-nowrap">
                        {KIND_LABEL[person.inviteKind]}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full whitespace-nowrap ${deliveryClass(
                            person.emailStatus,
                          )}`}
                        >
                          {deliveryLabel(person.emailStatus)}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        {result && (
                          <span
                            className={`text-[11px] ${
                              result.notice.tone === 'warn'
                                ? 'text-red-600 font-medium'
                                : 'text-green-700'
                            }`}
                          >
                            {result.notice.text}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="px-6 py-4 mt-2 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-gray-500">
              {sending ? (
                <>
                  Sending {sentCount} of {selectedTargets.length}…
                </>
              ) : selectedTargets.length === 0 ? (
                'Tick the people who should get a fresh link.'
              ) : (
                <>
                  <span className="font-semibold text-gray-700">
                    {selectedTargets.length} {selectedTargets.length === 1 ? 'person' : 'people'}
                  </span>{' '}
                  selected · one email each
                </>
              )}
            </p>

            <button
              onClick={sendToSelected}
              disabled={sending || selectedTargets.length === 0}
              className="text-xs font-medium bg-brand-900 text-white px-4 py-2 rounded-lg hover:bg-brand-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {sending
                ? 'Sending…'
                : `Send access link to ${selectedTargets.length} ${
                    selectedTargets.length === 1 ? 'person' : 'people'
                  }`}
            </button>
          </div>
        </>
      )}

      {haltedReason && (
        <div className="mx-6 mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {haltedReason}
        </div>
      )}

      {!sending && results.length > 0 && (
        <div
          className={`mx-6 mb-4 rounded-xl border px-4 py-3 text-sm ${
            failures.length > 0
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-green-200 bg-green-50 text-green-800'
          }`}
        >
          <span className="font-semibold">
            {results.length - failures.length} of {results.length} emailed.
          </span>{' '}
          {failures.length > 0 ? (
            <>
              {failures.length} did not go out — see the reason on each row, fix it, then send
              again to just those people.
            </>
          ) : (
            <>Everyone selected has a fresh link on the way.</>
          )}
        </div>
      )}
    </section>
  )
}
