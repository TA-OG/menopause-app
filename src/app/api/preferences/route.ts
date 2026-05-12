import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sanitizeError } from '@/lib/sanitize-error'
import { rateLimit } from '@/lib/rate-limit'
import { z } from 'zod'

const UpdatePreferencesSchema = z.object({
  diet_type: z.enum(['whole_foods', 'mixed', 'convenience', 'specific', 'unaware']).optional(),
  exercise_level: z.enum(['very_active', 'moderately_active', 'lightly_active', 'not_active', 'limited']).optional(),
  stress_level: z.enum(['low', 'moderate', 'high', 'very_high']).optional(),
  sleep_quality: z.enum(['good', 'fair', 'poor', 'very_poor']).optional(),
  alcohol_frequency: z.enum(['never', 'occasionally', 'weekly', 'daily']).optional(),
  smoking_status: z.enum(['never', 'ex_smoker', 'current']).optional(),
  notification_hour: z.number().min(0).max(23).optional(),
  notification_enabled: z.boolean().optional(),
})

export async function GET(request: NextRequest) {
  const { success } = rateLimit(request, { limit: 30, windowMs: 60_000 })
  if (!success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('user_preferences')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (error) return NextResponse.json({ data: null })

  return NextResponse.json({ data })
}

export async function PATCH(request: NextRequest) {
  const { success } = rateLimit(request, { limit: 20, windowMs: 60_000 })
  if (!success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const parsed = UpdatePreferencesSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid preferences data' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('user_preferences')
      .upsert({ user_id: user.id, ...parsed.data }, { onConflict: 'user_id' })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 })
  }
}
