import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin-auth'
import { rateLimit } from '@/lib/rate-limit'
import { sanitizeError } from '@/lib/sanitize-error'

export const dynamic = 'force-dynamic'

const DAY_MS = 24 * 60 * 60 * 1000

export interface ErrorRow {
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

export interface RouteLatency {
  route: string
  count: number
  errors: number
  avgMs: number
  p95Ms: number
}

export interface DayBucket {
  date: string   // YYYY-MM-DD
  errors: number
}

export interface GroupedError {
  message: string
  route: string | null
  count: number
  lastSeen: string
}

export interface MonitoringMetrics {
  totals: {
    errors24h: number
    errors7d: number
    requests24h: number
    requests7d: number
    errorRate7d: number       // % of 7d requests with status >= 500
    avgMs7d: number
  }
  errorsByDay: DayBucket[]     // last 14 days
  slowestRoutes: RouteLatency[]
  topErrors: GroupedError[]
  recentErrors: ErrorRow[]
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[Math.max(0, idx)]
}

/**
 * GET /api/admin/events — aggregated monitoring metrics for the dashboard.
 * Admin only. Reads app_events via the service-role client (RLS blocks all else).
 */
export async function GET(request: NextRequest) {
  const { success } = rateLimit(request, { limit: 60, windowMs: 60_000 })
  if (!success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  const supabase = createClient()
  const auth = await requireAdmin(supabase)
  if (auth instanceof NextResponse) return auth

  try {
    const admin = createAdminClient()
    const now = Date.now()
    const since7d = new Date(now - 7 * DAY_MS).toISOString()
    const since14d = new Date(now - 14 * DAY_MS).toISOString()

    const [reqRes, errRes, recentRes] = await Promise.all([
      // Request events (7d) — latency + error-rate. Capped to bound memory.
      admin
        .from('app_events')
        .select('route, status, duration_ms, created_at')
        .eq('type', 'request')
        .gte('created_at', since7d)
        .order('created_at', { ascending: false })
        .limit(20000),
      // Error events (14d) — for the by-day chart + grouping.
      admin
        .from('app_events')
        .select('route, message, created_at')
        .eq('type', 'error')
        .gte('created_at', since14d)
        .order('created_at', { ascending: false })
        .limit(20000),
      // Most recent detailed errors for the feed.
      admin
        .from('app_events')
        .select('id, source, route, method, status, message, stack, digest, created_at')
        .eq('type', 'error')
        .order('created_at', { ascending: false })
        .limit(50),
    ])

    if (reqRes.error) throw reqRes.error
    if (errRes.error) throw errRes.error
    if (recentRes.error) throw recentRes.error

    const requests = reqRes.data ?? []
    const errors = errRes.data ?? []
    const recentErrors = (recentRes.data ?? []) as ErrorRow[]

    const cutoff24h = now - DAY_MS

    // ── totals ──────────────────────────────────────────────────────────────
    const requests24h = requests.filter((r) => new Date(r.created_at).getTime() >= cutoff24h)
    const errors24h = errors.filter((e) => new Date(e.created_at).getTime() >= cutoff24h).length
    const errors7d = errors.filter((e) => new Date(e.created_at).getTime() >= now - 7 * DAY_MS).length

    const failed7d = requests.filter((r) => (r.status ?? 0) >= 500).length
    const durations = requests.map((r) => r.duration_ms ?? 0).filter((d) => d > 0)
    const avgMs7d = durations.length
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0

    // ── errors by day (last 14 days, oldest → newest) ────────────────────────
    const dayMap = new Map<string, number>()
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now - i * DAY_MS).toISOString().slice(0, 10)
      dayMap.set(d, 0)
    }
    for (const e of errors) {
      const d = e.created_at.slice(0, 10)
      if (dayMap.has(d)) dayMap.set(d, (dayMap.get(d) ?? 0) + 1)
    }
    const errorsByDay: DayBucket[] = Array.from(dayMap.entries()).map(([date, count]) => ({
      date,
      errors: count,
    }))

    // ── slowest routes (by p95, 7d) ──────────────────────────────────────────
    const routeAgg = new Map<string, { durs: number[]; errors: number }>()
    for (const r of requests) {
      const key = r.route ?? '(unknown)'
      const bucket = routeAgg.get(key) ?? { durs: [], errors: 0 }
      if ((r.duration_ms ?? 0) > 0) bucket.durs.push(r.duration_ms as number)
      if ((r.status ?? 0) >= 500) bucket.errors += 1
      routeAgg.set(key, bucket)
    }
    const slowestRoutes: RouteLatency[] = Array.from(routeAgg.entries())
      .map(([route, b]) => {
        const sorted = [...b.durs].sort((a, c) => a - c)
        const avg = sorted.length ? Math.round(sorted.reduce((a, c) => a + c, 0) / sorted.length) : 0
        return {
          route,
          count: sorted.length,
          errors: b.errors,
          avgMs: avg,
          p95Ms: Math.round(percentile(sorted, 95)),
        }
      })
      .sort((a, b) => b.p95Ms - a.p95Ms)
      .slice(0, 10)

    // ── top errors (grouped by message, 14d) ─────────────────────────────────
    const grouped = new Map<string, GroupedError>()
    for (const e of errors) {
      const msg = e.message ?? '(no message)'
      const key = `${msg}::${e.route ?? ''}`
      const existing = grouped.get(key)
      if (existing) {
        existing.count += 1
        if (e.created_at > existing.lastSeen) existing.lastSeen = e.created_at
      } else {
        grouped.set(key, { message: msg, route: e.route, count: 1, lastSeen: e.created_at })
      }
    }
    const topErrors = Array.from(grouped.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    const metrics: MonitoringMetrics = {
      totals: {
        errors24h,
        errors7d,
        requests24h: requests24h.length,
        requests7d: requests.length,
        errorRate7d: requests.length ? (failed7d / requests.length) * 100 : 0,
        avgMs7d,
      },
      errorsByDay,
      slowestRoutes,
      topErrors,
      recentErrors,
    }

    return NextResponse.json(metrics)
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 })
  }
}
