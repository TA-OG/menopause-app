import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Self-hosted application monitoring — a small "mini-Sentry".
 *
 * Two primitives:
 *   recordEvent()    — best-effort insert of one app_events row. Never throws;
 *                      monitoring must never break the request it observes.
 *   withMonitoring() — wraps an API route handler so every request records a
 *                      'request' event (status + duration) and any thrown error
 *                      records a detailed 'error' event before re-raising.
 *
 * Events are awaited (not fire-and-forget): on Vercel the function may freeze
 * the moment the response is returned, dropping un-awaited promises. The cost
 * is one Supabase insert per request — acceptable at this app's scale, and the
 * insert is wrapped so a monitoring failure can never surface to the user.
 */

export interface AppEventInput {
  type: 'request' | 'error'
  level?: 'info' | 'warning' | 'error'
  source?: 'server' | 'client'
  route?: string | null
  method?: string | null
  status?: number | null
  durationMs?: number | null
  message?: string | null
  stack?: string | null
  digest?: string | null
  userId?: string | null
  userAgent?: string | null
  meta?: Record<string, unknown> | null
}

/** Insert a single monitoring event. Swallows all failures. */
export async function recordEvent(e: AppEventInput): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin.from('app_events').insert({
      type: e.type,
      level: e.level ?? (e.type === 'error' ? 'error' : 'info'),
      source: e.source ?? 'server',
      route: e.route ?? null,
      method: e.method ?? null,
      status: e.status ?? null,
      duration_ms: e.durationMs ?? null,
      message: e.message?.slice(0, 2000) ?? null,
      stack: e.stack?.slice(0, 8000) ?? null,
      digest: e.digest ?? null,
      user_id: e.userId ?? null,
      user_agent: e.userAgent?.slice(0, 500) ?? null,
      meta: e.meta ?? null,
    })
  } catch {
    // Best-effort. A monitoring failure must never affect the observed request.
  }
}

type RouteHandler = (
  _request: NextRequest,
  _context?: { params: Record<string, string> },
) => Promise<Response> | Response

/**
 * Wrap an API route handler to record monitoring events.
 *
 * - Always records a 'request' event with the final status + duration.
 * - If the handler throws, also records a detailed 'error' event (message +
 *   stack) and re-throws so Next.js still returns its 500.
 *
 * Routes that catch their own errors and return a sanitized 500 still get a
 * 'request' row (status 500) here; pair that with a recordEvent() call inside
 * the catch block to capture the underlying detail without double-counting.
 *
 *   export const POST = withMonitoring('/api/journal', async (request) => { ... })
 */
export function withMonitoring(route: string, handler: RouteHandler): RouteHandler {
  return async (request, context) => {
    const start = Date.now()
    const method = request.method
    const userAgent = request.headers.get('user-agent')

    try {
      const res = await handler(request, context)
      await recordEvent({
        type: 'request',
        level: res.status >= 500 ? 'error' : 'info',
        route,
        method,
        status: res.status,
        durationMs: Date.now() - start,
        userAgent,
      })
      return res
    } catch (err) {
      const durationMs = Date.now() - start
      await recordEvent({
        type: 'error',
        route,
        method,
        status: 500,
        durationMs,
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack ?? null : null,
        userAgent,
      })
      await recordEvent({
        type: 'request',
        level: 'error',
        route,
        method,
        status: 500,
        durationMs,
        userAgent,
      })
      throw err
    }
  }
}
