import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin-auth'
import { rateLimit } from '@/lib/rate-limit'
import { sanitizeError } from '@/lib/sanitize-error'

export const dynamic = 'force-dynamic'

/**
 * DELETE /api/admin/geo-restrictions/overrides/[userId] — revoke a user's
 * access override. After this the user is subject to their country's mode again.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { userId: string } },
) {
  const { success } = rateLimit(request, { limit: 30, windowMs: 60_000 })
  if (!success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  const supabase = createClient()
  const auth = await requireAdmin(supabase)
  if (auth instanceof NextResponse) return auth

  try {
    const admin = createAdminClient()
    const { error } = await admin
      .from('geo_access_overrides')
      .delete()
      .eq('user_id', params.userId)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 })
  }
}
