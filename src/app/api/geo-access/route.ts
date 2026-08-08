import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGeoAccess } from '@/lib/geo'
import { rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * GET /api/geo-access — returns the current user's jurisdiction access:
 *   { allowed, mode, personalisedAllowed, reason, country }
 *
 * Used by the app to decide whether to show the personalised plan or a
 * region-limited notice. Fails open (full access) on any error.
 */
export async function GET(request: NextRequest) {
  const { success } = rateLimit(request, { limit: 60, windowMs: 60_000 })
  if (!success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const access = await getGeoAccess(createAdminClient(), user.id)
  return NextResponse.json(access)
}
