import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sanitizeError } from '@/lib/sanitize-error'
import { rateLimit } from '@/lib/rate-limit'
import { withMonitoring, recordEvent } from '@/lib/monitoring'
import { CheckinSchema } from '@/lib/checkin-schema'

export const dynamic = 'force-dynamic'

async function postHandler(request: NextRequest) {
  const { success } = await rateLimit(request, { limit: 10, windowMs: 60_000 })
  if (!success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const parsed = CheckinSchema.safeParse(body)
    if (!parsed.success) {
      // A rejected check-in is a real failure the user sees as "could not
      // save", so record which field was rejected. Without this, a contract
      // mismatch between page and route is invisible in production — the
      // client only ever shows a generic message.
      //
      // Field path + issue code only, never zod's default message: those
      // interpolate the received VALUE, which here would mean a user's symptom
      // ratings or free-text notes landing in the monitoring table. This is
      // menopause health data, so the log records the shape of the failure and
      // nothing about its content.
      await recordEvent({
        type: 'error',
        level: 'warning',
        route: '/api/symptom-checkin',
        method: 'POST',
        status: 400,
        message: `Check-in validation failed: ${parsed.error.issues
          .map((i) => {
            const field = i.path.join('.') || '(root)'
            const detail =
              i.code === 'invalid_type' ? ` (expected ${i.expected}, got ${i.received})` : ''
            return `${field}: ${i.code}${detail}`
          })
          .join('; ')}`,
        userId: user.id,
      })
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
    await recordEvent({
      type: 'error', route: '/api/symptom-checkin', method: 'POST', status: 500,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack ?? null : null,
      userId: user.id,
    })
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 })
  }
}

async function getHandler(request: NextRequest) {
  const { success } = await rateLimit(request, { limit: 30, windowMs: 60_000 })
  if (!success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)

  let query = supabase
    .from('symptom_checkins')
    .select('*')
    .eq('user_id', user.id)

  // Single-day lookup, used by the check-in page to load an existing entry so
  // re-opening the form shows what was already logged instead of blank
  // defaults that would overwrite it on the next upsert.
  const date = searchParams.get('date')
  if (date !== null) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
    }
    query = query.eq('checkin_date', date)
  }

  const limit = Math.min(parseInt(searchParams.get('limit') ?? '30'), 90)
  query = query
    .order('checkin_date', { ascending: false })
    .limit(Number.isNaN(limit) ? 30 : limit)

  const { data, error } = await query

  if (error) {
    await recordEvent({
      type: 'error', route: '/api/symptom-checkin', method: 'GET', status: 500,
      message: error.message, userId: user.id,
    })
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 })
  }

  return NextResponse.json({ data })
}

export const POST = withMonitoring('/api/symptom-checkin', postHandler)
export const GET = withMonitoring('/api/symptom-checkin', getHandler)
