import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin-auth'
import { rateLimit } from '@/lib/rate-limit'
import { sanitizeError } from '@/lib/sanitize-error'

export const dynamic = 'force-dynamic'

type GeoMode = 'disabled' | 'info_only' | 'full'
const VALID_MODES: GeoMode[] = ['disabled', 'info_only', 'full']

/**
 * GET  /api/admin/geo-restrictions — list every country with its current mode.
 * PUT  /api/admin/geo-restrictions — set the mode for one country.
 *        body: { country_code: string (2 chars), mode: 'disabled'|'info_only'|'full' }
 *
 * Admin only. `enabled` is kept in sync with mode (enabled = mode !== 'disabled').
 *
 * EU non-discrimination: every EU member state (`is_eu = true`) must carry the
 * same mode — the geo_restrictions trigger (migration 025) cascades this at
 * the DB level whenever an EU row changes. When a PUT targets an EU country,
 * the response includes `cascaded`: the full, post-cascade set of EU rows,
 * so the caller can update every affected country in the UI, not just the
 * one it asked for.
 */
export async function GET(request: NextRequest) {
  const { success } = await rateLimit(request, { limit: 60, windowMs: 60_000 })
  if (!success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  const supabase = createClient()
  const auth = await requireAdmin(supabase)
  if (auth instanceof NextResponse) return auth

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('geo_restrictions')
      .select('country_code, country_name, mode, enabled, updated_at, is_eu')
      .order('country_name')

    if (error) throw error
    return NextResponse.json({ restrictions: data ?? [] })
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  const { success } = await rateLimit(request, { limit: 60, windowMs: 60_000 })
  if (!success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  const supabase = createClient()
  const auth = await requireAdmin(supabase)
  if (auth instanceof NextResponse) return auth

  const body = await request.json().catch(() => null)
  const country_code = body?.country_code
  const mode = body?.mode

  if (typeof country_code !== 'string' || country_code.length !== 2) {
    return NextResponse.json({ error: 'Invalid country_code' }, { status: 400 })
  }
  if (!VALID_MODES.includes(mode)) {
    return NextResponse.json(
      { error: `mode must be one of: ${VALID_MODES.join(', ')}` },
      { status: 400 },
    )
  }

  try {
    const admin = createAdminClient()
    // update() not upsert(): rows are pre-seeded via migration 018, and the
    // country_name NOT NULL column isn't in this payload — an upsert INSERT leg
    // would violate it. .single() also turns "no matching country" into a 404.
    const { data: updated, error } = await admin
      .from('geo_restrictions')
      .update({
        mode,
        enabled: mode !== 'disabled',
        updated_at: new Date().toISOString(),
        updated_by: auth.id,
      })
      .eq('country_code', country_code.toUpperCase())
      .select('country_code, country_name, mode, enabled, updated_at, is_eu')
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: `Country '${country_code.toUpperCase()}' is not configured. Add it via a DB migration first.` },
          { status: 404 },
        )
      }
      throw error
    }

    // EU countries move in lockstep (migration 025 cascades this in a DB
    // trigger). Return the full post-cascade EU set so the caller can
    // reflect every affected country, not just the one it targeted.
    let cascaded: typeof updated[] | undefined
    if (updated.is_eu) {
      const { data: euRows, error: euError } = await admin
        .from('geo_restrictions')
        .select('country_code, country_name, mode, enabled, updated_at, is_eu')
        .eq('is_eu', true)
      if (euError) throw euError
      cascaded = euRows ?? undefined
    }

    return NextResponse.json({ ok: true, restriction: updated, cascaded })
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 })
  }
}
