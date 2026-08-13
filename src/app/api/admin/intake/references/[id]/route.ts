import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin-auth'
import { rateLimit } from '@/lib/rate-limit'
import { sanitizeError } from '@/lib/sanitize-error'

/**
 * DELETE /api/admin/intake/references/[id]
 * Removes a single external reference.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const { success } = await rateLimit(request, { limit: 30, windowMs: 60_000 })
  if (!success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  const supabase = createClient()
  const auth = await requireAdmin(supabase)
  if (auth instanceof NextResponse) return auth

  try {
    const admin = createAdminClient()
    const { error } = await admin
      .from('content_intake_references')
      .delete()
      .eq('id', params.id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 })
  }
}
