import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Resolve and authorise the calling admin for an API route.
 *
 * Returns the authenticated user when they have `profiles.is_admin = true`,
 * or a ready-to-return `NextResponse` (401/403) otherwise. This mirrors the
 * gate enforced by the /admin layout, applied per-route so the admin APIs are
 * never reachable without it.
 *
 * Usage:
 *   const auth = await requireAdmin(supabase)
 *   if (auth instanceof NextResponse) return auth
 *   // auth.id is the admin's user id
 */
export async function requireAdmin(
  supabase: SupabaseClient,
): Promise<{ id: string } | NextResponse> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return { id: user.id }
}
