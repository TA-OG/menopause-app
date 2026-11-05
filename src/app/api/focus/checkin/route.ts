import { NextRequest, NextResponse } from 'next/server'
import { withMonitoring } from '@/lib/monitoring'
import { FocusCheckinSchema, decideFocusCheckin, focusRatings } from '@/lib/focus-api'
import { changesOnCheckin } from '@/lib/focus-programme'
import {
  authenticate,
  contextOrGate,
  implausibleToday,
  parseBody,
  refusalResponse,
  serverError,
} from '@/lib/focus-route'

export const dynamic = 'force-dynamic'

const ROUTE = '/api/focus/checkin'

/**
 * POST /api/focus/checkin  { checkin_date, ratings, done, not_done }
 *
 * The 10-second daily check-in. Written through record_focus_checkin(), which
 * MERGES into the day's symptom_checkins row — a plain upsert here would wipe
 * whatever she logged on the full check-in form that day (migration 036).
 */
async function postHandler(request: NextRequest) {
  const auth = await authenticate(request, 20)
  if (!auth.ok) return auth.response
  const { supabase, user } = auth
  const where = { route: ROUTE, method: 'POST', userId: user.id }

  const body = await parseBody(request, FocusCheckinSchema, where)
  if (!body.ok) return body.response
  const input = body.data
  const badDate = implausibleToday(input.checkin_date)
  if (badDate) return badDate

  try {
    const loaded = await contextOrGate(supabase, user.id)
    if (!loaded.ok) return loaded.response
    const { programme, weeks } = loaded.context
    if (!programme) {
      return NextResponse.json({ error: 'No active programme' }, { status: 409 })
    }

    const decision = decideFocusCheckin(programme, weeks, input)
    if (!decision.ok) return refusalResponse(decision)

    const { data, error } = await supabase.rpc('record_focus_checkin', {
      p_checkin_date: input.checkin_date,
      p_symptoms: input.ratings,
      p_done: input.done,
      p_not_done: input.not_done,
    })
    if (error) throw error

    // Echo back only what the programme owns, not the whole day's row.
    const row = data as { checkin_date: string; symptoms: Record<string, unknown> | null; tried_today: string[] | null }
    // Same shape as todayCheckin in GET /api/focus.
    const onCheckin = new Set(changesOnCheckin(weeks).map((w) => w.recommendation_id))
    return NextResponse.json(
      {
        data: {
          checkin_date: row.checkin_date,
          ratings: focusRatings(row.symptoms, programme.focus_symptoms),
          done: (row.tried_today ?? []).filter((id) => onCheckin.has(id)),
        },
      },
      { status: 201 }
    )
  } catch (err) {
    return serverError(err, where)
  }
}

export const POST = withMonitoring(ROUTE, postHandler)
