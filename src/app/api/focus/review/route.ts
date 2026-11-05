import { NextRequest, NextResponse } from 'next/server'
import { withMonitoring } from '@/lib/monitoring'
import { ReviewWeekSchema, decideReview } from '@/lib/focus-api'
import { applyReview } from '@/lib/focus-writes'
import {
  authenticate,
  contextOrGate,
  implausibleToday,
  parseBody,
  refusalResponse,
  serverError,
} from '@/lib/focus-route'

export const dynamic = 'force-dynamic'

const ROUTE = '/api/focus/review'

/**
 * POST /api/focus/review  { today, outcome, release_week_ids? }
 *
 * Close the open week. kept / stopped from day 7; swapped any time. Keeping is
 * refused while it would put more than 3 changes on her check-in, unless she
 * releases kept changes in the same request (decideReview).
 */
async function postHandler(request: NextRequest) {
  const auth = await authenticate(request, 10)
  if (!auth.ok) return auth.response
  const { supabase, user } = auth
  const where = { route: ROUTE, method: 'POST', userId: user.id }

  const body = await parseBody(request, ReviewWeekSchema, where)
  if (!body.ok) return body.response
  const input = body.data
  const badDate = implausibleToday(input.today)
  if (badDate) return badDate

  try {
    const loaded = await contextOrGate(supabase, user.id)
    if (!loaded.ok) return loaded.response
    const { programme, weeks } = loaded.context
    if (!programme) {
      return NextResponse.json({ error: 'No active programme' }, { status: 409 })
    }

    const decision = decideReview(weeks, input)
    if (!decision.ok) return refusalResponse(decision)

    const reviewed = await applyReview(
      supabase,
      programme.id,
      decision.week.id,
      input.outcome,
      decision.releaseIds,
      input.today
    )
    if (!reviewed.ok) return refusalResponse(reviewed)
    return NextResponse.json({ data: { week: reviewed.week } })
  } catch (err) {
    return serverError(err, where)
  }
}

export const POST = withMonitoring(ROUTE, postHandler)
