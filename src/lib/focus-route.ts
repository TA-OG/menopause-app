import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { sanitizeError } from '@/lib/sanitize-error'
import { rateLimit } from '@/lib/rate-limit'
import { recordEvent } from '@/lib/monitoring'
import { describeIssues, isPlausibleLocalToday, type Refusal } from './focus-api'
import { gateResponseBody, gateStatus, loadFocusContext, type FocusContext } from './focus-context'

/**
 * Plumbing shared by the focus programme routes (src/app/api/focus/**), so
 * each one is rate-limited, authenticated, gated, validated and logged the
 * same way as the rest of the API (cf. /api/symptom-checkin).
 *
 * Logging rule: nothing she entered reaches app_events. Validation failures
 * record field path + issue code only (describeIssues); refusals record the
 * fixed refusal text, never request values.
 */

type Ok<T> = { ok: true } & T
type Stop = { ok: false; response: NextResponse }

export async function authenticate(
  request: NextRequest,
  limit: number
): Promise<Ok<{ supabase: SupabaseClient; user: User }> | Stop> {
  const { success } = await rateLimit(request, { limit, windowMs: 60_000 })
  if (!success) {
    return { ok: false, response: NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 }) }
  }
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  return { ok: true, supabase, user }
}

/** Load her context, or the 403/409 response for a closed gate. */
export async function contextOrGate(
  supabase: SupabaseClient,
  userId: string
): Promise<Ok<{ context: FocusContext }> | Stop> {
  const result = await loadFocusContext(supabase, userId)
  if (!result.ok) {
    return {
      ok: false,
      response: NextResponse.json(gateResponseBody(result.gate), { status: gateStatus(result.gate) }),
    }
  }
  return { ok: true, context: result.context }
}

/** Parse a JSON body against a schema, logging only the shape of a failure. */
export async function parseBody<S extends z.ZodTypeAny>(
  request: NextRequest,
  schema: S,
  where: { route: string; method: string; userId: string }
): Promise<Ok<{ data: z.output<S> }> | Stop> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return { ok: false, response: NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    await recordEvent({
      type: 'error',
      level: 'warning',
      route: where.route,
      method: where.method,
      status: 400,
      message: `Focus request validation failed: ${describeIssues(parsed.error)}`,
      userId: where.userId,
    })
    return { ok: false, response: NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
  }
  return { ok: true, data: parsed.data }
}

/** 400 unless `today` could really be her local date right now. */
export function implausibleToday(today: string): NextResponse | null {
  return isPlausibleLocalToday(today)
    ? null
    : NextResponse.json({ error: "Your device's date looks wrong" }, { status: 400 })
}

export function refusalResponse(refusal: Refusal): NextResponse {
  return NextResponse.json({ error: refusal.error }, { status: refusal.status })
}

export async function serverError(
  err: unknown,
  where: { route: string; method: string; userId: string }
): Promise<NextResponse> {
  await recordEvent({
    type: 'error',
    route: where.route,
    method: where.method,
    status: 500,
    message: err instanceof Error ? err.message : errorMessage(err),
    stack: err instanceof Error ? err.stack ?? null : null,
    userId: where.userId,
  })
  return NextResponse.json({ error: sanitizeError(err) }, { status: 500 })
}

/**
 * PostgrestError is a plain object, not an Error, so String() would log
 * "[object Object]". Its message/code carry no row values (those are in
 * `details`, which is deliberately not logged).
 */
function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const e = err as { message: unknown; code?: unknown }
    return `${String(e.message)}${e.code ? ` (${String(e.code)})` : ''}`
  }
  return String(err)
}
