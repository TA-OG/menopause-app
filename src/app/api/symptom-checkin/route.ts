import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sanitizeError } from '@/lib/sanitize-error'
import { rateLimit } from '@/lib/rate-limit'
import { z } from 'zod'

const CheckinSchema = z.object({
  checkin_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  symptoms: z.record(z.number().min(1).max(5)).optional(),
  severity_overall: z.number().min(1).max(5).optional(),
  mood_score: z.number().min(1).max(5).optional(),
  energy_level: z.number().min(1).max(5).optional(),
  sleep_hours: z.number().min(0).max(24).optional(),
  tried_today: z.array(z.string()).optional(),
  notes: z.string().max(2000).optional(),
})

export async function POST(request: NextRequest) {
  const { success } = rateLimit(request, { limit: 10, windowMs: 60_000 })
  if (!success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const parsed = CheckinSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid check-in data' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('symptom_checkins')
      .upsert({
        user_id: user.id,
        ...parsed.data,
      }, { onConflict: 'user_id,checkin_date' })
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

  const { searchParams } = new URL(request.url)
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '30'), 90)

  const { data, error } = await supabase
    .from('symptom_checkins')
    .select('*')
    .eq('user_id', user.id)
    .order('checkin_date', { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: sanitizeError(error) }, { status: 500 })

  return NextResponse.json({ data })
}
