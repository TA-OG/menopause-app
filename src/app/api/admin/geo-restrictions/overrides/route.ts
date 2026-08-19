import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin-auth'
import { rateLimit } from '@/lib/rate-limit'
import { sanitizeError } from '@/lib/sanitize-error'
import { findUserIdByEmail } from '@/lib/find-user'

export const dynamic = 'force-dynamic'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * GET  /api/admin/geo-restrictions/overrides — list all per-user access overrides.
 * POST /api/admin/geo-restrictions/overrides — grant one by email.
 *        body: { email: string, reason?: string|null, expires_at?: string|null }
 *
 * An override gives that user full access regardless of their country.
 */
export async function GET(request: NextRequest) {
  const { success } = await rateLimit(request, { limit: 60, windowMs: 60_000 })
  if (!success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  const supabase = createClient()
  const auth = await requireAdmin(supabase)
  if (auth instanceof NextResponse) return auth

  try {
    const admin = createAdminClient()
    const { data: rows, error } = await admin
      .from('geo_access_overrides')
      .select('id, user_id, reason, expires_at, created_at')
      .order('created_at', { ascending: false })

    if (error) throw error

    // Decorate with email + name from the profile for a readable list.
    const overrides = await Promise.all(
      (rows ?? []).map(async (o) => {
        const { data: profile } = await admin
          .from('profiles')
          .select('full_name')
          .eq('id', o.user_id)
          .maybeSingle()
        const { data: authUser } = await admin.auth.admin.getUserById(o.user_id)
        return {
          ...o,
          email: authUser?.user?.email ?? null,
          full_name: profile?.full_name ?? null,
        }
      }),
    )

    return NextResponse.json({ overrides })
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const { success } = await rateLimit(request, { limit: 30, windowMs: 60_000 })
  if (!success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  const supabase = createClient()
  const auth = await requireAdmin(supabase)
  if (auth instanceof NextResponse) return auth

  const body = await request.json().catch(() => null)
  const email = body?.email?.trim()?.toLowerCase()
  const reason = body?.reason?.trim() || null
  const expires_at = body?.expires_at ?? null

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 })
  }

  try {
    const admin = createAdminClient()

    const userId = await findUserIdByEmail(admin, email)

    if (!userId) {
      return NextResponse.json(
        { error: 'No user found with that email. They must have signed up first.' },
        { status: 404 },
      )
    }

    const { data: override, error } = await admin
      .from('geo_access_overrides')
      .upsert(
        { user_id: userId, granted_by: auth.id, reason, expires_at },
        { onConflict: 'user_id' },
      )
      .select('id, user_id, reason, expires_at, created_at')
      .single()

    if (error) throw error

    return NextResponse.json({ ok: true, override: { ...override, email } })
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 })
  }
}
