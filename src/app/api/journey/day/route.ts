import { NextRequest, NextResponse } from 'next/server'
import { withMonitoring } from '@/lib/monitoring'
import { JourneyDaySchema, decideDay } from '@/lib/journey-api'
import { loadJourneyContext } from '@/lib/journey-context'
import {
  authenticate,
  implausibleToday,
  parseBody,
  refusalResponse,
  serverError,
} from '@/lib/focus-route'

export const dynamic = 'force-dynamic'

const ROUTE = '/api/journey/day'

/**
 * POST /api/journey/day  { today, feeling?, invitation_outcome? }
 *
 * Her answer for today: how she feels this morning, and/or "I did this" /
 * "Not today" for the Feel Safe invitation open today. Which invitation is
 * worked out on the server from her start date (decideDay). A second answer
 * the same day replaces only the parts it includes.
 */
async function postHandler(request: NextRequest) {
  const auth = await authenticate(request, 30)
  if (!auth.ok) return auth.response
  const { supabase, user } = auth
  const where = { route: ROUTE, method: 'POST', userId: user.id }

  const body = await parseBody(request, JourneyDaySchema, where)
  if (!body.ok) return body.response
  const input = body.data
  const badDate = implausibleToday(input.today)
  if (badDate) return badDate

  try {
    const ctx = await loadJourneyContext(supabase, user.id)
    if (!ctx.visible) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!ctx.journey) return NextResponse.json({ error: 'Your path has not started yet' }, { status: 409 })

    const decision = decideDay(ctx.journey, ctx.weeks, input)
    if (!decision.ok) return refusalResponse(decision)

    // Upsert writes only the columns in the row, so answering the invitation
    // later in the day keeps this morning's feeling, and vice versa.
    const { data, error } = await supabase
      .from('journey_days')
      .upsert({ user_id: user.id, ...decision.row }, { onConflict: 'user_id,day' })
      .select('day, feeling, invitation_id, invitation_outcome')
      .single()
    if (error) throw error

    return NextResponse.json({ data: { day: data } })
  } catch (err) {
    return serverError(err, where)
  }
}

export const POST = withMonitoring(ROUTE, postHandler)
