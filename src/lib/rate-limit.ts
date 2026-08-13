import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Postgres-backed rate limiter (see supabase/migrations/027_rate_limits.sql).
 *
 * Replaces a previous in-memory Map implementation that provided NO real
 * protection in production: on Vercel serverless, each invocation can land
 * on a fresh process, so a module-level Map is empty every time. Postgres
 * is the one piece of state every invocation can reach, so the counter
 * lives there instead — a single atomic RPC call per check.
 */

interface RateLimitOptions {
  limit: number        // max requests
  windowMs: number     // window in milliseconds
}

interface RateLimitResult {
  success: boolean
  remaining: number
}

export async function rateLimit(
  request: NextRequest,
  options: RateLimitOptions = { limit: 20, windowMs: 60_000 }
): Promise<RateLimitResult> {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'

  const key = `${ip}:${request.nextUrl.pathname}`

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .rpc('check_rate_limit', {
        p_key: key,
        p_limit: options.limit,
        p_window_ms: options.windowMs,
      })
      .single()

    if (error) throw error

    const result = data as { allowed: boolean; remaining: number }
    return { success: result.allowed, remaining: result.remaining }
  } catch (err) {
    // Fail OPEN, not closed: if the rate-limit store itself is unreachable,
    // blocking every request would turn a rate-limiter outage into a full
    // app outage. The DB being down already breaks every other route in
    // this app, so this doesn't meaningfully widen the blast radius — but
    // it does mean abuse protection briefly lapses instead of the app
    // going dark. Logged so a persistent failure here doesn't go unnoticed.
    console.error(`rate-limit check failed for ${request.nextUrl.pathname}:`, err)
    return { success: true, remaining: options.limit }
  }
}
