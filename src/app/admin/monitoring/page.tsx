'use client'

/**
 * /admin/monitoring — self-hosted app health ("mini-Sentry").
 *
 * Reads aggregated events from /api/admin/events:
 *   1. Totals       — errors (24h/7d), requests, error rate, avg latency
 *   2. Errors/day   — 14-day sparkline
 *   3. Slowest      — per-route p95 / avg latency (7d)
 *   4. Top errors   — grouped by message (14d)
 *   5. Recent feed  — latest 50 errors with stack traces
 *
 * Admin-only: the /admin layout gates on profiles.is_admin and the API
 * re-checks server-side via requireAdmin().
 */

import { useCallback, useEffect, useState } from 'react'

interface ErrorRow {
  id: string
  source: 'server' | 'client'
  route: string | null
  method: string | null
  status: number | null
  message: string | null
  stack: string | null
  digest: string | null
  created_at: string
}
interface RouteLatency {
  route: string
  count: number
  errors: number
  avgMs: number
  p95Ms: number
}
interface DayBucket { date: string; errors: number }
interface GroupedError { message: string; route: string | null; count: number; lastSeen: string }

interface Metrics {
  totals: {
    errors24h: number
    errors7d: number
    requests24h: number
    requests7d: number
    errorRate7d: number
    avgMs7d: number
  }
  errorsByDay: DayBucket[]
  slowestRoutes: RouteLatency[]
  topErrors: GroupedError[]
  recentErrors: ErrorRow[]
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

function Stat({ label, value, sub, tone }: {
  label: string; value: string | number; sub?: string; tone?: 'ok' | 'warn' | 'bad'
}) {
  const valueColor =
    tone === 'bad' ? 'text-red-600' : tone === 'warn' ? 'text-amber-600' : 'text-brand-900'
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${valueColor}`}>{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

export default function MonitoringDashboard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/events')
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? `events ${res.status}`)
      setMetrics(body)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load monitoring')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const maxDay = Math.max(1, ...(metrics?.errorsByDay ?? []).map((d) => d.errors))
  const maxP95 = Math.max(1, ...(metrics?.slowestRoutes ?? []).map((r) => r.p95Ms))
  const errorRate = metrics?.totals.errorRate7d ?? 0

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">App Monitoring</h1>
          <p className="text-sm text-gray-500 mt-0.5">Errors &amp; performance — self-hosted</p>
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
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Totals */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Stat label="Errors (24h)" value={metrics?.totals.errors24h ?? '…'}
          tone={(metrics?.totals.errors24h ?? 0) > 0 ? 'bad' : 'ok'} />
        <Stat label="Errors (7d)" value={metrics?.totals.errors7d ?? '…'} />
        <Stat label="Requests (24h)" value={metrics?.totals.requests24h ?? '…'} />
        <Stat label="Requests (7d)" value={metrics?.totals.requests7d ?? '…'} />
        <Stat
          label="Error rate (7d)"
          value={metrics ? `${errorRate.toFixed(2)}%` : '…'}
          tone={errorRate >= 5 ? 'bad' : errorRate >= 1 ? 'warn' : 'ok'}
          sub="5xx / requests"
        />
        <Stat
          label="Avg latency (7d)"
          value={metrics ? `${metrics.totals.avgMs7d}ms` : '…'}
          tone={(metrics?.totals.avgMs7d ?? 0) >= 1000 ? 'warn' : 'ok'}
        />
      </div>

      {/* Errors per day */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h2 className="font-semibold text-brand-900 mb-1">Errors per day</h2>
        <p className="text-xs text-gray-400 mb-4">Last 14 days</p>
        <div className="flex items-end gap-1 h-28">
          {(metrics?.errorsByDay ?? []).map((d) => (
            <div key={d.date} className="flex-1 flex flex-col items-center justify-end h-full group">
              <span className="text-[10px] text-gray-400 mb-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {d.errors}
              </span>
              <div
                className={`w-full rounded-t ${d.errors > 0 ? 'bg-red-400' : 'bg-gray-100'}`}
                style={{ height: `${(d.errors / maxDay) * 100}%`, minHeight: 2 }}
                title={`${d.date}: ${d.errors} error${d.errors === 1 ? '' : 's'}`}
              />
              <span className="text-[9px] text-gray-300 mt-1">{d.date.slice(8)}</span>
            </div>
          ))}
          {!loading && (metrics?.errorsByDay.length ?? 0) === 0 && (
            <p className="text-sm text-gray-400">No data yet.</p>
          )}
        </div>
      </section>

      {/* Slowest routes */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-brand-900">Slowest routes</h2>
          <p className="text-xs text-gray-400 mt-0.5">By 95th-percentile latency · last 7 days</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wider">
                <th className="px-6 py-3">Route</th>
                <th className="px-4 py-3">Requests</th>
                <th className="px-4 py-3">Errors</th>
                <th className="px-4 py-3">Avg</th>
                <th className="px-4 py-3 w-1/4">p95</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(metrics?.slowestRoutes ?? []).map((r) => (
                <tr key={r.route} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-mono text-xs text-brand-900">{r.route}</td>
                  <td className="px-4 py-3 text-gray-600">{r.count}</td>
                  <td className="px-4 py-3">
                    {r.errors > 0
                      ? <span className="text-red-600 font-medium">{r.errors}</span>
                      : <span className="text-gray-300">0</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{r.avgMs}ms</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${r.p95Ms >= 1000 ? 'bg-amber-400' : 'bg-brand-400'}`}
                          style={{ width: `${(r.p95Ms / maxP95) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 w-14 text-right">{r.p95Ms}ms</span>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && (metrics?.slowestRoutes.length ?? 0) === 0 && (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400 text-sm">
                  No request data yet. Instrumented routes will appear here once they receive traffic.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Top errors */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-brand-900">Top errors</h2>
          <p className="text-xs text-gray-400 mt-0.5">Grouped by message · last 14 days</p>
        </div>
        <div className="divide-y divide-gray-50">
          {(metrics?.topErrors ?? []).map((e, i) => (
            <div key={i} className="px-6 py-3 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm text-brand-900 truncate">{e.message}</p>
                {e.route && <p className="text-xs text-gray-400 font-mono truncate">{e.route}</p>}
              </div>
              <div className="text-right shrink-0">
                <span className="bg-red-100 text-red-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                  ×{e.count}
                </span>
                <p className="text-[10px] text-gray-400 mt-0.5">{relTime(e.lastSeen)}</p>
              </div>
            </div>
          ))}
          {!loading && (metrics?.topErrors.length ?? 0) === 0 && (
            <p className="px-6 py-12 text-center text-gray-400 text-sm">No errors recorded. 🎉</p>
          )}
        </div>
      </section>

      {/* Recent error feed */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-brand-900">Recent errors</h2>
          <p className="text-xs text-gray-400 mt-0.5">Latest 50 · click a row for the stack trace</p>
        </div>
        <div className="divide-y divide-gray-50">
          {(metrics?.recentErrors ?? []).map((e) => (
            <div key={e.id}>
              <button
                onClick={() => setOpenId(openId === e.id ? null : e.id)}
                className="w-full text-left px-6 py-3 hover:bg-gray-50 flex items-center gap-3"
              >
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0 ${
                  e.source === 'client' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {e.source}
                </span>
                {e.status != null && (
                  <span className="text-[10px] font-bold text-red-600 shrink-0">{e.status}</span>
                )}
                <span className="text-sm text-brand-900 truncate flex-1">{e.message ?? '(no message)'}</span>
                {e.route && <span className="text-xs text-gray-400 font-mono hidden sm:inline truncate max-w-[14rem]">{e.route}</span>}
                <span className="text-[10px] text-gray-400 shrink-0">{relTime(e.created_at)}</span>
              </button>
              {openId === e.id && (
                <div className="px-6 pb-4 bg-gray-50">
                  <div className="text-[11px] text-gray-500 mb-2 flex flex-wrap gap-x-4 gap-y-1">
                    {e.method && <span>{e.method} {e.route}</span>}
                    <span>{new Date(e.created_at).toLocaleString('en-GB')}</span>
                    {e.digest && <span>digest: {e.digest}</span>}
                  </div>
                  {e.stack ? (
                    <pre className="text-[11px] text-gray-600 bg-white border border-gray-100 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
                      {e.stack}
                    </pre>
                  ) : (
                    <p className="text-xs text-gray-400">No stack trace captured.</p>
                  )}
                </div>
              )}
            </div>
          ))}
          {!loading && (metrics?.recentErrors.length ?? 0) === 0 && (
            <p className="px-6 py-12 text-center text-gray-400 text-sm">No errors recorded yet.</p>
          )}
        </div>
      </section>
    </div>
  )
}
