import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sanitizeError } from '@/lib/sanitize-error'
import { rateLimit } from '@/lib/rate-limit'
import { z } from 'zod'

const JournalEntrySchema = z.object({
  content: z.string().max(10000),
  symptom_focus: z.string().optional().nullable(),
  plan_item_id: z.string().optional().nullable(),
  plan_item_title: z.string().max(200).optional().nullable(),
  days_tried: z.number().min(0).optional().nullable(),
  perceived_effect: z.enum(['much_better', 'better', 'no_change', 'worse']).optional().nullable(),
  would_continue: z.boolean().optional().nullable(),
})

export async function POST(request: NextRequest) {
  const { success } = rateLimit(request, { limit: 20, windowMs: 60_000 })
  if (!success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const parsed = JournalEntrySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid journal entry' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('journal_entries')
      .insert({ user_id: user.id, ...parsed.data })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const { success } = rateLimit(request, { limit: 30, windowMs: 60_000 })
  if (!success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Check tier — free users get last 7 days only
  const { data: profile } = await supabase
    .from('profiles')
    .select('subscription_tier')
    .eq('id', user.id)
    .single()

  const isPremium = profile?.subscription_tier === 'premium'
  const { searchParams } = new URL(request.url)
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20'), 50)

  let query = supabase
    .from('journal_entries')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  // Free tier — last 7 days only
  if (!isPremium) {
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    query = query.gte('created_at', sevenDaysAgo.toISOString())
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: sanitizeError(error) }, { status: 500 })

  return NextResponse.json({ data, limited: !isPremium })
}
