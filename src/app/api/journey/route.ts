import { NextRequest, NextResponse } from 'next/server'
import { withMonitoring } from '@/lib/monitoring'
import { StartJourneySchema, buildJourneyState, decideStart } from '@/lib/journey-api'
import { loadJourneyContext, loadRecentDays } from '@/lib/journey-context'
import {
  authenticate,
  implausibleToday,
  parseBody,
  refusalResponse,
  serverError,
} from '@/lib/focus-route'

export const dynamic = 'force-dynamic'

const ROUTE = '/api/journey'
const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 })

/**
 * GET /api/journey?today=YYYY-MM-DD
 *
 * Where she is on her path: which questions are left, the focus she is
 * offered and Mel's suggestion, her stage and day, today's answers, and
 * whether Mel adds the safety line. 404 while the journey is not open to her.
 */
async function getHandler(request: NextRequest) {
  const auth = await authenticate(request, 30)
  if (!auth.ok) return auth.response
  const { supabase, user } = auth
  const where = { route: ROUTE, method: 'GET', userId: user.id }

  const today = new URL(request.url).searchParams.get('today') ?? ''
  const badDate = implausibleToday(today)
  if (badDate) return badDate

  try {
    const ctx = await loadJourneyContext(supabase, user.id)
    if (!ctx.visible) return notFound()
    const days = ctx.journey ? await loadRecentDays(supabase, user.id, today) : []
    return NextResponse.json({
      data: buildJourneyState({ ...ctx, days, today }),
    })
  } catch (err) {
    return serverError(err, where)
  }
}

/**
 * POST /api/journey  { focus_area, today }
 *
 * Start her path with the focus she chose with Mel, or change it. Only once
 * her questions are done, and only to an area she is offered. Changing focus
 * keeps her start date: it changes what Foundations works on, not her week.
 */
async function postHandler(request: NextRequest) {
  const auth = await authenticate(request, 10)
  if (!auth.ok) return auth.response
  const { supabase, user } = auth
  const where = { route: ROUTE, method: 'POST', userId: user.id }

  const body = await parseBody(request, StartJourneySchema, where)
  if (!body.ok) return body.response
  const { focus_area, today } = body.data
  const badDate = implausibleToday(today)
  if (badDate) return badDate

  try {
    const ctx = await loadJourneyContext(supabase, user.id)
    if (!ctx.visible) return notFound()

    const decision = decideStart(ctx.signals, new Set(ctx.answers.map((a) => a.question_key)), focus_area)
    if (!decision.ok) return refusalResponse(decision)

    const { data, error } = ctx.journey
      ? await supabase
          .from('journeys')
          .update({ focus_area: decision.focusArea })
          .eq('user_id', user.id)
          .select('focus_area, started_on')
          .single()
      : await supabase
          .from('journeys')
          .insert({ user_id: user.id, focus_area: decision.focusArea, started_on: today })
          .select('focus_area, started_on')
          .single()
    if (error) throw error

    return NextResponse.json({ data: { journey: data } }, { status: ctx.journey ? 200 : 201 })
  } catch (err) {
    return serverError(err, where)
  }
}

export const GET = withMonitoring(ROUTE, getHandler)
export const POST = withMonitoring(ROUTE, postHandler)
