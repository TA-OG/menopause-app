import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Unseen, already-applied referral rewards — the "you just earned a free
// month" banner shows these once, then the client marks them seen via POST.
export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: rewards } = await supabase
    .from('referral_rewards')
    .select('id, role, months, applied_at')
    .eq('user_id', user.id)
    .eq('status', 'applied')
    .is('notified_at', null)
    .order('applied_at', { ascending: true })

  return NextResponse.json({ rewards: rewards ?? [] })
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { ids } = await request.json().catch(() => ({ ids: [] }))
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids is required' }, { status: 400 })
  }

  // referral_rewards has no user-facing UPDATE policy (only service-role
  // writes), so this goes through the admin client — scoped to the caller's
  // own user_id so one user can never mark another's rewards as seen.
  const admin = createAdminClient()
  const { error } = await admin
    .from('referral_rewards')
    .update({ notified_at: new Date().toISOString() })
    .in('id', ids)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
