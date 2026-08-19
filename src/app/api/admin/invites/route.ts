import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin-auth'
import { rateLimit } from '@/lib/rate-limit'
import { sanitizeError } from '@/lib/sanitize-error'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/invites — the invite log shown on the admin dashboard.
 *
 * Returns every invite sent from the admin panel, newest first, with the
 * outcome of its complimentary premium grant, plus a summary counting how
 * many grants failed. A failed grant means someone was invited but did NOT
 * receive the premium they were promised, so it needs to be obvious.
 */
export async function GET(request: NextRequest) {
  const { success } = await rateLimit(request, { limit: 60, windowMs: 60_000 })
  if (!success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  const supabase = createClient()
  const auth = await requireAdmin(supabase)
  if (auth instanceof NextResponse) return auth

  try {
    const admin = createAdminClient()

    const { data: invites, error } = await admin
      .from('admin_invites')
      // Kept as a single string literal, not a concatenation: supabase-js
      // infers the row type from the literal, and splitting it across an
      // expression collapses that inference to an error type.
      .select('id, email, first_name, user_id, invite_kind, already_registered, complimentary_status, complimentary_months, complimentary_expires_at, error, created_at')
      .order('created_at', { ascending: false })
      .limit(500)

    if (error) throw error

    const rows = invites ?? []

    return NextResponse.json({
      invites: rows,
      summary: {
        total: rows.length,
        granted: rows.filter((i) => i.complimentary_status === 'granted').length,
        alreadySubscribed: rows.filter((i) => i.complimentary_status === 'already_subscribed').length,
        failed: rows.filter((i) => i.complimentary_status === 'failed').length,
      },
    })
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 })
  }
}
