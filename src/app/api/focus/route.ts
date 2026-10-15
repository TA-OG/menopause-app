import { NextRequest, NextResponse } from 'next/server'
import { withMonitoring } from '@/lib/monitoring'
import {
  StartProgrammeSchema,
  buildFocusState,
  chooseWeekChange,
  parseFocusParam,
  type CheckinRow,
} from '@/lib/focus-api'
import { normaliseFocusSymptoms, openWeek, selectWeeklyChange } from '@/lib/focus-programme'
import { endProgramme, startProgramme } from '@/lib/focus-writes'
import {
  authenticate,
  contextOrGate,
  implausibleToday,
  parseBody,
  refusalResponse,
  serverError,
} from '@/lib/focus-route'

export const dynamic = 'force-dynamic'

const ROUTE = '/api/focus'

/**
 * GET /api/focus?today=YYYY-MM-DD[&focus=a,b]
 *
 * Her programme as it stands today. Without a programme: the symptoms she may
 * focus on and, for `focus`, a preview of week 1. With one: this week and the
 * kept changes (cards re-read from her CURRENT plan, so personal notes and
 * cautions reflect her current answers), the next choice when no week is open,
 * today's check-in and the open week's focus ratings.
 */
async function getHandler(request: NextRequest) {
  const auth = await authenticate(request, 30)
  if (!auth.ok) return auth.response
  const { supabase, user } = auth
  const where = { route: ROUTE, method: 'GET', userId: user.id }

  const { searchParams } = new URL(request.url)
  const today = searchParams.get('today') ?? ''
  const badDate = implausibleToday(today)
  if (badDate) return badDate

  try {
    const loaded = await contextOrGate(supabase, user.id)
    if (!loaded.ok) return loaded.response
    const { context } = loaded

    let previewFocus = null
    const requested = parseFocusParam(searchParams.get('focus'))
    if (!context.programme && requested.length > 0) {
      const normalised = normaliseFocusSymptoms(requested, context.signals)
      if (!normalised.ok) {
        return NextResponse.json({ error: normalised.error }, { status: 400 })
      }
      previewFocus = normalised.symptoms
    }

    let checkins: CheckinRow[] = []
    if (context.programme) {
      const from = openWeek(context.weeks)?.starts_on ?? today
      const { data, error } = await supabase
        .from('symptom_checkins')
        .select('checkin_date, symptoms, tried_today')
        .eq('user_id', user.id)
        .gte('checkin_date', from < today ? from : today)
        .lte('checkin_date', today)
        // Newest first, so a week left unreviewed for months still includes
        // today; buildFocusState() puts them back in date order.
        .order('checkin_date', { ascending: false })
        .limit(31)
      if (error) throw error
      checkins = (data ?? []) as CheckinRow[]
    }

    return NextResponse.json({
      data: buildFocusState({ ...context, today, previewFocus, checkins }),
    })
  } catch (err) {
    return serverError(err, where)
  }
}

/**
 * POST /api/focus  { focus_symptoms, today }
 *
 * Start a programme and open week 1. Refused (409) when nothing in her plan
 * matches the symptoms she chose, so a programme is never created empty.
 */
async function postHandler(request: NextRequest) {
  const auth = await authenticate(request, 10)
  if (!auth.ok) return auth.response
  const { supabase, user } = auth
  const where = { route: ROUTE, method: 'POST', userId: user.id }

  const body = await parseBody(request, StartProgrammeSchema, where)
  if (!body.ok) return body.response
  const { focus_symptoms, today } = body.data
  const badDate = implausibleToday(today)
  if (badDate) return badDate

  try {
    const loaded = await contextOrGate(supabase, user.id)
    if (!loaded.ok) return loaded.response
    const { context } = loaded

    if (context.programme) {
      return NextResponse.json({ error: 'You already have a programme in progress' }, { status: 409 })
    }

    const focus = normaliseFocusSymptoms(focus_symptoms, context.signals)
    if (!focus.ok) return NextResponse.json({ error: focus.error }, { status: 400 })

    const firstWeek = chooseWeekChange(
      selectWeeklyChange(context.plan, focus.symptoms, context.signals)
    )
    if (!firstWeek.ok) return refusalResponse(firstWeek)

    const started = await startProgramme(supabase, user.id, context, focus.symptoms, today)
    if (!started.ok) return refusalResponse(started)

    return NextResponse.json(
      { data: { programme: started.programme, week: started.week } },
      { status: 201 }
    )
  } catch (err) {
    return serverError(err, where)
  }
}

/** DELETE /api/focus — end her programme. Weeks are kept as history. */
async function deleteHandler(request: NextRequest) {
  const auth = await authenticate(request, 10)
  if (!auth.ok) return auth.response
  const { supabase, user } = auth
  const where = { route: ROUTE, method: 'DELETE', userId: user.id }

  try {
    // No premium/geo gate: she can always end what she started, including
    // after her subscription lapses or her region changes.
    const ended = await endProgramme(supabase, user.id)
    if (!ended.ok) return refusalResponse(ended)
    return NextResponse.json({ data: { programme: ended.programme } })
  } catch (err) {
    return serverError(err, where)
  }
}

export const GET = withMonitoring(ROUTE, getHandler)
export const POST = withMonitoring(ROUTE, postHandler)
export const DELETE = withMonitoring(ROUTE, deleteHandler)
