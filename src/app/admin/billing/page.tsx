'use client'

/**
 * /admin/billing — the missing piece: an actual view of who has premium and
 * whether the DB agrees with Stripe (ground truth), instead of needing to
 * hand-write SQL in the Supabase dashboard to answer "which account has a
 * subscription". Backed by /api/admin/billing-audit.
 */

import { useCallback, useEffect, useState } from 'react'

interface AuditRow {
  userId: string
  email: string | null
  isAdmin: boolean
  db: {
    tier: string
    status: string | null
    stripeCustomerId: string | null
    stripeSubscriptionId: string | null
  }
  stripeTruth: { subscriptionId: string | null; status: string | null; entitled: boolean } | null
  drift: boolean
  driftReason: string | null
  fixed?: boolean
}

interface Anomaly { userId: string; email: string | null; reason: string }
interface WebhookEvent {
  stripe_event_id: string
  event_type: string
  status: string
  error: string | null
  processed_at: string
}

interface AuditReport {
  checked: number
  driftCount: number
  drifted: AuditRow[]
  clean: AuditRow[]
  anomalies: Anomaly[]
  unresolvedWebhookEvents: WebhookEvent[]
  appliedFixes: boolean
}

function Pill({ tone, children }: { tone: 'green' | 'red' | 'amber' | 'gray'; children: React.ReactNode }) {
  const cls = {
    green: 'bg-green-100 text-green-700',
    red: 'bg-red-100 text-red-700',
    amber: 'bg-amber-100 text-amber-700',
    gray: 'bg-gray-100 text-gray-500',
  }[tone]
  return <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${cls}`}>{children}</span>
}

export default function AdminBillingPage() {
  const [report, setReport] = useState<AuditReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [fixing, setFixing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/billing-audit')
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? `${res.status}`)
      setReport(body)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load billing audit')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const fixAll = async () => {
    setFixing(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/billing-audit', { method: 'POST' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? `${res.status}`)
      setReport(body)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fix failed')
    } finally {
      setFixing(false)
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Billing</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Every account checked directly against Stripe — Stripe is the source of truth, the DB is a cache of it.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="text-xs text-gray-500 hover:text-brand-900 disabled:opacity-40 transition-colors"
        >
          {loading ? 'Refreshing…' : '↺ Refresh'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">{error}</div>
      )}

      {loading && !report ? (
        <p className="text-sm text-gray-400">Checking every account against Stripe…</p>
      ) : report && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs text-gray-500">Accounts checked</p>
              <p className="text-2xl font-bold text-brand-900 mt-1">{report.checked}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs text-gray-500">Out of sync with Stripe</p>
              <p className={`text-2xl font-bold mt-1 ${report.driftCount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {report.driftCount}
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs text-gray-500">Anomalies</p>
              <p className={`text-2xl font-bold mt-1 ${report.anomalies.length > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                {report.anomalies.length}
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs text-gray-500">Unresolved webhook events</p>
              <p className={`text-2xl font-bold mt-1 ${report.unresolvedWebhookEvents.length > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {report.unresolvedWebhookEvents.length}
              </p>
            </div>
          </div>

          {/* Drifted accounts */}
          {report.drifted.length > 0 && (
            <section className="bg-white rounded-2xl border border-red-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-red-700">Out of sync with Stripe</h2>
                  <p className="text-xs text-gray-400 mt-0.5">The DB disagrees with what Stripe actually says.</p>
                </div>
                <button
                  onClick={fixAll}
                  disabled={fixing}
                  className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-40 text-sm font-medium text-white transition-colors whitespace-nowrap"
                >
                  {fixing ? 'Fixing…' : `Fix all ${report.drifted.length} account${report.drifted.length !== 1 ? 's' : ''}`}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wider">
                      <th className="px-6 py-3">Email</th>
                      <th className="px-4 py-3">DB says</th>
                      <th className="px-4 py-3">Stripe says</th>
                      <th className="px-4 py-3">Reason</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {report.drifted.map((r) => (
                      <tr key={r.userId} className="hover:bg-gray-50">
                        <td className="px-6 py-3 font-medium text-brand-900">
                          {r.email ?? r.userId}
                          {r.isAdmin && <span className="ml-2"><Pill tone="gray">admin</Pill></span>}
                        </td>
                        <td className="px-4 py-3">
                          <Pill tone={r.db.tier === 'premium' ? 'green' : 'gray'}>{r.db.tier}</Pill>
                        </td>
                        <td className="px-4 py-3">
                          <Pill tone={r.stripeTruth?.entitled ? 'green' : 'gray'}>
                            {r.stripeTruth?.entitled ? 'premium' : 'free'}
                          </Pill>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 max-w-sm">{r.driftReason}</td>
                        <td className="px-4 py-3">
                          {r.fixed ? <Pill tone="green">fixed</Pill> : <Pill tone="red">drift</Pill>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Anomalies — can't auto-fix, need a human call */}
          {report.anomalies.length > 0 && (
            <section className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-amber-700">Anomalies — needs a human decision</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Premium set with nothing in Stripe to verify it against — could be intentional (comped access) or a bug.
                </p>
              </div>
              <div className="divide-y divide-gray-50">
                {report.anomalies.map((a) => (
                  <div key={a.userId} className="px-6 py-3 text-sm">
                    <p className="font-medium text-brand-900">{a.email ?? a.userId}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{a.reason}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Unresolved webhook events */}
          {report.unresolvedWebhookEvents.length > 0 && (
            <section className="bg-white rounded-2xl border border-red-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-red-700">Unresolved webhook events</h2>
                <p className="text-xs text-gray-400 mt-0.5">Stuck in 'processing' or ended in 'failed' — Stripe delivered these but we never finished handling them.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wider">
                      <th className="px-6 py-3">Event</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Error</th>
                      <th className="px-4 py-3">When</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {report.unresolvedWebhookEvents.map((e) => (
                      <tr key={e.stripe_event_id} className="hover:bg-gray-50">
                        <td className="px-6 py-3 text-gray-700">{e.event_type}</td>
                        <td className="px-4 py-3"><Pill tone={e.status === 'failed' ? 'red' : 'amber'}>{e.status}</Pill></td>
                        <td className="px-4 py-3 text-xs text-gray-500 max-w-sm truncate">{e.error ?? '—'}</td>
                        <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                          {new Date(e.processed_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Clean accounts — the actual answer to "who has premium" */}
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-brand-900">Verified against Stripe</h2>
              <p className="text-xs text-gray-400 mt-0.5">Matches what Stripe actually says — nothing to fix.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wider">
                    <th className="px-6 py-3">Email</th>
                    <th className="px-4 py-3">Tier</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {report.clean.map((r) => (
                    <tr key={r.userId} className="hover:bg-gray-50">
                      <td className="px-6 py-3 font-medium text-brand-900">
                        {r.email ?? r.userId}
                        {r.isAdmin && <span className="ml-2"><Pill tone="gray">admin</Pill></span>}
                      </td>
                      <td className="px-4 py-3">
                        <Pill tone={r.db.tier === 'premium' ? 'green' : 'gray'}>{r.db.tier}</Pill>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{r.db.status ?? '—'}</td>
                    </tr>
                  ))}
                  {report.clean.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-6 py-12 text-center text-gray-400 text-sm">
                        No billing-relevant accounts yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
