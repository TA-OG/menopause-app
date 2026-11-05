import { NextRequest, NextResponse } from 'next/server'
import { withMonitoring } from '@/lib/monitoring'
import { OpenWeekSchema } from '@/lib/focus-api'
import { openNextWeek } from '@/lib/focus-writes'
import {
  authenticate,
  contextOrGate,
  implausibleToday,
  parseBody,
  refusalResponse,
  serverError,
} from '@/lib/focus-route'

export const dynamic = 'force-dynamic'

const ROUTE = '/api/focus/week'

/**
 * POST /api/focus/week  { today, recommendation_id? }
 *
 * Open the next week, after she has reviewed the last one. The change is
 * re-selected here against her current plan; `recommendation_id` may only
 * name the app's pick or one of the alternatives it offered.
 */
async function postHandler(request: NextRequest) {
  const auth = await authenticate(request, 10)
  if (!auth.ok) return auth.response
  const { supabase, user } = auth
  const where = { route: ROUTE, method: 'POST', userId: user.id }

  const body = await parseBody(request, OpenWeekSchema, where)
  if (!body.ok) return body.response
  const { today, recommendation_id } = body.data
  const badDate = implausibleToday(today)
  if (badDate) return badDate

  try {
    const loaded = await contextOrGate(supabase, user.id)
    if (!loaded.ok) return loaded.response

    const opened = await openNextWeek(supabase, user.id, loaded.context, today, recommendation_id)
    if (!opened.ok) return refusalResponse(opened)
    return NextResponse.json({ data: { week: opened.week } }, { status: 201 })
  } catch (err) {
    return serverError(err, where)
  }
}

export const POST = withMonitoring(ROUTE, postHandler)
