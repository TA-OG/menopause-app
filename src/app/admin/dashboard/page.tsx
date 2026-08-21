'use client'

/**
 * /admin/dashboard — Admin: app performance by jurisdiction + geo controls.
 *
 * Sections:
 *   1. Totals       — users, premium, conversion, new, active markets
 *   2. Jurisdiction — per-country performance (users / premium / mode)
 *   3. Invite log   — everyone invited from the admin panel + their
 *                     complimentary premium status
 *   4. Geo control  — set each country Off / Info Only / Live
 *   5. Overrides    — grant specific users full access regardless of country
 *
 * Admin-only: the /admin layout already gates on profiles.is_admin, and every
 * API this page calls re-checks it server-side via requireAdmin().
 */

import { useCallback, useEffect, useState } from 'react'

type GeoMode = 'disabled' | 'info_only' | 'full'

const MODE_CYCLE: Record<GeoMode, GeoMode> = {
  disabled: 'info_only',
  info_only: 'full',
  full: 'disabled',
}

interface JurisdictionRow {
  country_code: string
  country_name: string
  mode: GeoMode | 'unconfigured'
  users: number
  premium: number
}

interface Metrics {
  totals: {
    users: number
    premium: number
    free: number
    conversionRate: number
    newLast30Days: number
    activeMarkets: number
  }
  byJurisdiction: JurisdictionRow[]
}

interface GeoRestriction {
  country_code: string
  country_name: string
  mode: GeoMode
  enabled: boolean
  updated_at: string
  is_eu: boolean
}

interface GeoOverride {
  id: string
  user_id: string
  email: string | null
  full_name: string | null
  reason: string | null
  expires_at: string | null
  created_at: string
}

type ComplimentaryStatus =
  | 'pending_activation'
  | 'activating'
  | 'granted'
  | 'already_subscribed'
  | 'failed'
  | 'not_attempted'

interface AdminInvite {
  id: string
  email: string
  first_name: string | null
  user_id: string | null
  invite_kind: 'waitlist' | 'author'
  already_registered: boolean
  complimentary_status: ComplimentaryStatus
  complimentary_months: number | null
  complimentary_expires_at: string | null
  activated_at: string | null
  error: string | null
  created_at: string
}

interface InviteLog {
  invites: AdminInvite[]
  summary: {
    total: number
    granted: number
    awaitingSignIn: number
    alreadySubscribed: number
    failed: number
  }
}

// ── small helpers ──────────────────────────────────────────────────────────

function modeLabel(mode: GeoMode | 'unconfigured'): string {
  return mode === 'full'
    ? 'Live'
    : mode === 'info_only'
    ? 'Info Only'
    : mode === 'disabled'
    ? 'Off'
    : 'Unconfigured'
}

function modeBadgeClass(mode: GeoMode | 'unconfigured'): string {
  return mode === 'full'
    ? 'bg-green-100 text-green-700'
    : mode === 'info_only'
    ? 'bg-amber-100 text-amber-700'
    : mode === 'disabled'
    ? 'bg-gray-100 text-gray-500'
    : 'bg-gray-100 text-gray-400'
}

function compLabel(status: ComplimentaryStatus): string {
  return status === 'granted'
    ? 'Premium active'
    : status === 'pending_activation'
    ? 'Starts on sign-in'
    : status === 'activating'
    ? 'Starting…'
    : status === 'already_subscribed'
    ? 'Already subscribed'
    : status === 'failed'
    ? 'NOT granted'
    : 'Admin access'
}

function compBadgeClass(status: ComplimentaryStatus): string {
  return status === 'granted'
    ? 'bg-green-100 text-green-700'
    : status === 'pending_activation' || status === 'activating'
    ? 'bg-amber-100 text-amber-700'
    : status === 'already_subscribed'
    ? 'bg-blue-100 text-blue-700'
    : status === 'failed'
    ? 'bg-red-100 text-red-700'
    : 'bg-gray-100 text-gray-500'
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function relTime(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now()
  const days = Math.round(diff / (24 * 60 * 60 * 1000))
  if (days === 0) return 'today'
  if (days > 0) return `in ${days}d`
  return `${Math.abs(days)}d ago`
}

// ── stat card ──────────────────────────────────────────────────────────────

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-brand-900 mt-1">{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── main ───────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [restrictions, setRestrictions] = useState<GeoRestriction[]>([])
  const [overrides, setOverrides] = useState<GeoOverride[]>([])
  const [inviteLog, setInviteLog] = useState<InviteLog | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)
  const [cycleError, setCycleError] = useState<string | null>(null)

  const [countryFilter, setCountryFilter] = useState('')

  const [overrideEmail, setOverrideEmail] = useState('')
  const [overrideReason, setOverrideReason] = useState('')
  const [granting, setGranting] = useState(false)
  const [overrideError, setOverrideError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [mRes, rRes, oRes, iRes] = await Promise.all([
        fetch('/api/admin/metrics'),
        fetch('/api/admin/geo-restrictions'),
        fetch('/api/admin/geo-restrictions/overrides'),
        fetch('/api/admin/invites'),
      ])
      const [m, r, o, i] = await Promise.all([mRes.json(), rRes.json(), oRes.json(), iRes.json()])
      if (!mRes.ok) throw new Error(m.error ?? `metrics ${mRes.status}`)
      if (!rRes.ok) throw new Error(r.error ?? `geo-restrictions ${rRes.status}`)
      if (!oRes.ok) throw new Error(o.error ?? `overrides ${oRes.status}`)
      if (!iRes.ok) throw new Error(i.error ?? `invites ${iRes.status}`)
      setMetrics(m)
      setRestrictions(r.restrictions ?? [])
      setOverrides(o.overrides ?? [])
      setInviteLog(i)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const cycleMode = async (code: string, current: GeoMode) => {
    const next = MODE_CYCLE[current]
    setCycleError(null)
    setToggling(code)
    try {
      const res = await fetch('/api/admin/geo-restrictions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country_code: code, mode: next }),
      })
      const body = await res.json()
      if (!res.ok) {
        setCycleError(body.error ?? `Could not update ${code}`)
        await load()
        return
      }
      const confirmed = body.restriction as GeoRestriction
      // EU countries move in lockstep (EU non-discrimination law) — the API
      // cascades the change server-side and returns every affected EU row
      // so we can reflect all of them here, not just the one clicked.
      const cascaded = body.cascaded as GeoRestriction[] | undefined
      setRestrictions((prev) =>
        prev.map((r) => {
          if (cascaded) {
            const match = cascaded.find((c) => c.country_code === r.country_code)
            if (match) return match
          }
          return r.country_code === confirmed.country_code ? confirmed : r
        }),
      )
      // Refresh metrics so the active-markets count + jurisdiction modes track.
      fetch('/api/admin/metrics').then((r) => r.json()).then((m) => {
        if (!m.error) setMetrics(m)
      }).catch(() => {})
    } catch (err) {
      setCycleError(err instanceof Error ? err.message : 'Network error — change may not have saved')
      await load()
    } finally {
      setToggling(null)
    }
  }

  const grantOverride = async () => {
    if (!overrideEmail.trim()) return
    setGranting(true)
    setOverrideError(null)
    try {
      const res = await fetch('/api/admin/geo-restrictions/overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: overrideEmail.trim(), reason: overrideReason.trim() || null }),
      })
      const body = await res.json()
      if (!res.ok) {
        setOverrideError(body.error ?? 'Failed to grant access')
      } else {
        setOverrideEmail('')
        setOverrideReason('')
        await load()
      }
    } catch (err) {
      setOverrideError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setGranting(false)
    }
  }

  const revokeOverride = async (userId: string) => {
    try {
      const res = await fetch(`/api/admin/geo-restrictions/overrides/${userId}`, { method: 'DELETE' })
      if (res.ok) {
        setOverrides((prev) => prev.filter((o) => o.user_id !== userId))
      } else {
        await load()
      }
    } catch {
      await load()
    }
  }

  const maxUsers = Math.max(1, ...(metrics?.byJurisdiction ?? []).map((j) => j.users))

  const filteredRestrictions = countryFilter.trim()
    ? restrictions.filter((r) => {
        const q = countryFilter.trim().toLowerCase()
        return r.country_name.toLowerCase().includes(q) || r.country_code.toLowerCase().includes(q)
      })
    : restrictions

  const liveCount = restrictions.filter((r) => r.mode !== 'disabled').length

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Performance Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Aunty Mel — by jurisdiction</p>
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
        <Stat label="Total Users" value={metrics?.totals.users ?? '…'} />
        <Stat label="Premium" value={metrics?.totals.premium ?? '…'} sub="Paid subscribers" />
        <Stat label="Free" value={metrics?.totals.free ?? '…'} />
        <Stat
          label="Conversion"
          value={metrics ? `${metrics.totals.conversionRate.toFixed(1)}%` : '…'}
          sub="Premium / total"
        />
        <Stat label="New (30d)" value={metrics?.totals.newLast30Days ?? '…'} />
        <Stat label="Active Markets" value={metrics?.totals.activeMarkets ?? '…'} sub="Info Only or Live" />
      </div>

      {/* Jurisdiction performance */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-brand-900">Performance by jurisdiction</h2>
          <p className="text-xs text-gray-400 mt-0.5">Where your users are and how each market is set</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wider">
                <th className="px-6 py-3">Country</th>
                <th className="px-4 py-3">Users</th>
                <th className="px-4 py-3">Premium</th>
                <th className="px-4 py-3 w-1/3">Share</th>
                <th className="px-4 py-3">Mode</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(metrics?.byJurisdiction ?? []).map((j) => (
                <tr key={j.country_code} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium text-brand-900">
                    {j.country_name}{' '}
                    <span className="text-gray-300 font-normal">{j.country_code}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{j.users}</td>
                  <td className="px-4 py-3 text-gray-500">{j.premium}</td>
                  <td className="px-4 py-3">
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-400 rounded-full"
                        style={{ width: `${(j.users / maxUsers) * 100}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${modeBadgeClass(j.mode)}`}>
                      {modeLabel(j.mode)}
                    </span>
                  </td>
                </tr>
              ))}
              {!loading && (metrics?.byJurisdiction.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-400 text-sm">
                    No users yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Invite log */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold text-brand-900">Invited users</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Everyone invited from the admin panel. Waitlist invites include{' '}
                <span className="font-semibold text-gray-500">12 months complimentary premium</span>,
                starting the first time they sign in.
              </p>
            </div>
            {inviteLog && (
              <div className="text-right shrink-0">
                <p className="text-xs text-gray-400">
                  {inviteLog.summary.total} invited · {inviteLog.summary.granted} active ·{' '}
                  {inviteLog.summary.awaitingSignIn} awaiting sign-in
                </p>
                {inviteLog.summary.failed > 0 && (
                  <p className="text-xs font-semibold text-red-600 mt-0.5">
                    {inviteLog.summary.failed} without premium
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* A failed grant means someone was invited but never got the premium
            they were promised — surface it loudly, not as a table cell. */}
        {(inviteLog?.summary.failed ?? 0) > 0 && (
          <div className="mx-6 mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {inviteLog!.summary.failed} invited{' '}
            {inviteLog!.summary.failed === 1 ? 'person' : 'people'} did not receive complimentary
            premium. They will hit the paywall — check the reason below and re-invite once fixed.
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wider">
                <th className="px-6 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Invited</th>
                <th className="px-4 py-3">Premium</th>
                <th className="px-4 py-3">Until</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(inviteLog?.invites ?? []).map((inv) => (
                <tr key={inv.id} className="hover:bg-gray-50 align-top">
                  <td className="px-6 py-3 font-medium text-brand-900">
                    {inv.first_name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600 break-all">{inv.email}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {inv.invite_kind === 'author' ? 'Author' : 'Waitlist'}
                    {inv.already_registered && (
                      <span
                        title="Already had an account — no new invite email was sent"
                        className="ml-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500"
                      >
                        existing
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                    {shortDate(inv.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full whitespace-nowrap ${compBadgeClass(
                        inv.complimentary_status,
                      )}`}
                    >
                      {compLabel(inv.complimentary_status)}
                    </span>
                    {inv.complimentary_status === 'failed' && inv.error && (
                      <p className="text-[11px] text-red-500 mt-1 max-w-xs">{inv.error}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {inv.complimentary_expires_at ? (
                      <>
                        {shortDate(inv.complimentary_expires_at)}
                        <span className="text-gray-300"> · {relTime(inv.complimentary_expires_at)}</span>
                      </>
                    ) : inv.complimentary_status === 'pending_activation' ||
                      inv.complimentary_status === 'activating' ? (
                      <span className="text-gray-400">not started yet</span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
              {!loading && (inviteLog?.invites.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-400 text-sm">
                    Nobody invited yet. Invites are sent from the{' '}
                    <a href="/admin" className="text-brand-600 hover:underline">
                      waitlist
                    </a>
                    .
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Geo access control */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-semibold text-brand-900">Geo access control</h2>
          <p className="text-xs text-gray-400">Tap a country to change its mode</p>
        </div>
        <p className="text-xs text-gray-400 mb-1">
          <span className="font-semibold text-gray-500">Off</span> — blocked, user sees an unavailable notice ·{' '}
          <span className="font-semibold text-amber-600">Info Only</span> — app + articles, no personalised plan ·{' '}
          <span className="font-semibold text-green-600">Live</span> — all features
        </p>
        <p className="text-xs text-gray-400 mb-4">
          <span className="font-semibold text-blue-600">EU</span>-flagged countries change together — EU
          non-discrimination law forbids treating one member state differently from another. Changing any EU
          country&rsquo;s mode moves every EU country to match.
        </p>

        {!loading && (
          <div className="flex items-center justify-between gap-3 mb-3">
            <input
              type="text"
              placeholder="Search countries…"
              value={countryFilter}
              onChange={(e) => setCountryFilter(e.target.value)}
              className="flex-1 max-w-xs px-3 py-1.5 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
            <p className="text-xs text-gray-400 whitespace-nowrap">
              {liveCount} of {restrictions.length} markets live/info-only
            </p>
          </div>
        )}

        {cycleError && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
            {cycleError}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[32rem] overflow-y-auto pr-1">
            {filteredRestrictions.length === 0 && (
              <p className="text-sm text-gray-400 col-span-full py-4 text-center">No countries match &ldquo;{countryFilter}&rdquo;.</p>
            )}
            {filteredRestrictions.map((r) => {
              const isToggling = toggling === r.country_code
              const btnTone =
                r.mode === 'full'
                  ? 'border-green-200 bg-green-50 hover:bg-green-100'
                  : r.mode === 'info_only'
                  ? 'border-amber-200 bg-amber-50 hover:bg-amber-100'
                  : 'border-gray-100 bg-white hover:bg-gray-50'
              return (
                <button
                  key={r.country_code}
                  disabled={isToggling}
                  onClick={() => cycleMode(r.country_code, r.mode)}
                  className={`flex items-center justify-between px-4 py-3 rounded-xl border text-left transition-colors disabled:opacity-50 ${btnTone}`}
                >
                  <span className="text-sm text-brand-900 flex items-center gap-1.5">
                    {r.country_name}
                    {r.is_eu && (
                      <span
                        title="EU non-discrimination: this country's mode moves in lockstep with every other EU country"
                        className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700"
                      >
                        EU
                      </span>
                    )}
                  </span>
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${modeBadgeClass(r.mode)}`}>
                    {isToggling ? '…' : modeLabel(r.mode)}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </section>

      {/* User overrides */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h2 className="font-semibold text-brand-900">User access overrides</h2>
        <p className="text-xs text-gray-400 mt-0.5 mb-4">
          Grant a specific user full access regardless of their country — for testers and beta pilots.
        </p>

        <div className="flex flex-col md:flex-row gap-2 mb-3">
          <input
            type="email"
            placeholder="user@email.com"
            value={overrideEmail}
            onChange={(e) => setOverrideEmail(e.target.value)}
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-400"
          />
          <input
            type="text"
            placeholder="Reason (e.g. internal tester)"
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-400"
          />
          <button
            onClick={grantOverride}
            disabled={granting || !overrideEmail.trim()}
            className="px-4 py-2 rounded-lg bg-brand-900 hover:bg-brand-800 disabled:opacity-40 text-sm font-medium text-white transition-colors whitespace-nowrap"
          >
            {granting ? 'Granting…' : 'Grant Access'}
          </button>
        </div>
        {overrideError && <p className="text-xs text-red-500 mb-3">{overrideError}</p>}

        {overrides.length === 0 ? (
          <p className="text-xs text-gray-400">No overrides granted yet.</p>
        ) : (
          <div className="space-y-2">
            {overrides.map((o) => (
              <div
                key={o.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm text-brand-900 truncate">{o.email ?? o.user_id}</p>
                  {o.full_name && <p className="text-xs text-gray-400">{o.full_name}</p>}
                  {o.reason && <p className="text-xs text-brand-600 mt-0.5">{o.reason}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] text-gray-400">
                    {o.expires_at ? `Expires ${relTime(o.expires_at)}` : 'No expiry'}
                  </p>
                  <button
                    onClick={() => revokeOverride(o.user_id)}
                    className="text-[10px] text-red-500/70 hover:text-red-500 mt-1 transition-colors"
                  >
                    Revoke
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
