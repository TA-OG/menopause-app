import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin-auth'
import { rateLimit } from '@/lib/rate-limit'
import { sanitizeError } from '@/lib/sanitize-error'
import { summariseInvites } from '@/lib/invite-log'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/invites — the invite log shown on the admin dashboard.
 *
 * Returns every invite sent from the admin panel, newest first, with the
 * outcome of its complimentary premium grant AND of the email itself, plus a
 * summary counting how many of each failed.
 *
 * Both failures are silent from the invitee's side and neither can be inferred
 * from the other. A failed grant means someone was invited but did NOT receive
 * the premium they were promised. email_status = 'not_sent' means nothing ever
 * reached her inbox — she does not know she was invited at all.
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
      .select('id, email, first_name, user_id, invite_kind, already_registered, email_status, email_error, complimentary_status, complimentary_months, complimentary_expires_at, activated_at, error, created_at')
      .order('created_at', { ascending: false })
      .limit(500)

    if (error) throw error

    const rows = invites ?? []

    // The table lists every attempt, but the summary counts PEOPLE: one woman
    // can have several rows, and resending her link adds another. Counting
    // rows would mean a resend that worked left her permanently counted as
    // "never emailed" alongside the row that fixed it — a red banner that can
    // never go green. summariseInvites() collapses her to one current state
    // first; see src/lib/invite-log.ts for the rules.
    return NextResponse.json({
      invites: rows,
      summary: summariseInvites(rows),
    })
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 })
  }
}
