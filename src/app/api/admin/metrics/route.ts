import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin-auth'
import { rateLimit } from '@/lib/rate-limit'
import { sanitizeError } from '@/lib/sanitize-error'

export const dynamic = 'force-dynamic'

type GeoMode = 'disabled' | 'info_only' | 'full'

export interface JurisdictionRow {
  country_code: string
  country_name: string
  mode: GeoMode | 'unconfigured'
  users: number
  premium: number
}

export interface AdminMetrics {
  totals: {
    users: number
    premium: number
    free: number
    conversionRate: number   // premium / users, as a percentage
    newLast30Days: number
    activeMarkets: number     // countries in info_only or full
  }
  byJurisdiction: JurisdictionRow[]
}

/**
 * GET /api/admin/metrics — headline numbers + per-jurisdiction breakdown.
 * Admin only. Aggregates from profiles (country, subscription_tier) joined
 * against geo_restrictions for each country's configured mode.
 */
export async function GET(request: NextRequest) {
  const { success } = rateLimit(request, { limit: 60, windowMs: 60_000 })
  if (!success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  const supabase = createClient()
  const auth = await requireAdmin(supabase)
  if (auth instanceof NextResponse) return auth

  try {
    const admin = createAdminClient()

    const [{ data: profiles, error: pErr }, { data: restrictions, error: rErr }] =
      await Promise.all([
        admin.from('profiles').select('subscription_tier, country, created_at'),
        admin.from('geo_restrictions').select('country_code, country_name, mode'),
      ])

    if (pErr) throw pErr
    if (rErr) throw rErr

    const rows = profiles ?? []
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000

    const totalUsers = rows.length
    const premium = rows.filter((r) => r.subscription_tier === 'premium').length
    const newLast30Days = rows.filter(
      (r) => r.created_at && new Date(r.created_at).getTime() >= thirtyDaysAgo,
    ).length

    // Map of configured countries → { name, mode }
    const configured = new Map(
      (restrictions ?? []).map((r) => [
        r.country_code.toUpperCase(),
        { name: r.country_name, mode: r.mode as GeoMode },
      ]),
    )

    // Aggregate users/premium per country code.
    const agg = new Map<string, { users: number; premium: number }>()
    for (const r of rows) {
      const code = (r.country ?? 'XX').toUpperCase()
      const bucket = agg.get(code) ?? { users: 0, premium: 0 }
      bucket.users += 1
      if (r.subscription_tier === 'premium') bucket.premium += 1
      agg.set(code, bucket)
    }

    // Build the jurisdiction list: every configured country (so admins see
    // markets even with zero users), plus any country with users that isn't
    // configured, plus an "Unknown" bucket for users with no country set.
    const byJurisdiction: JurisdictionRow[] = []

    Array.from(configured.entries()).forEach(([code, info]) => {
      const counts = agg.get(code) ?? { users: 0, premium: 0 }
      byJurisdiction.push({
        country_code: code,
        country_name: info.name,
        mode: info.mode,
        users: counts.users,
        premium: counts.premium,
      })
    })

    Array.from(agg.entries()).forEach(([code, counts]) => {
      if (configured.has(code)) return
      byJurisdiction.push({
        country_code: code,
        country_name: code === 'XX' ? 'Unknown / not set' : code,
        mode: 'unconfigured',
        users: counts.users,
        premium: counts.premium,
      })
    })

    // Sort by user count desc, then name.
    byJurisdiction.sort(
      (a, b) => b.users - a.users || a.country_name.localeCompare(b.country_name),
    )

    const metrics: AdminMetrics = {
      totals: {
        users: totalUsers,
        premium,
        free: totalUsers - premium,
        conversionRate: totalUsers > 0 ? (premium / totalUsers) * 100 : 0,
        newLast30Days,
        activeMarkets: (restrictions ?? []).filter((r) => r.mode !== 'disabled').length,
      },
      byJurisdiction,
    }

    return NextResponse.json(metrics)
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 })
  }
}
