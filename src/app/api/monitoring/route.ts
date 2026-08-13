import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { recordEvent } from '@/lib/monitoring'
import { rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * POST /api/monitoring — ingest a client-side error.
 *
 * Called by the global-error boundary when a render crashes in the browser.
 * Open to any caller (errors can happen before/around auth) but rate-limited
 * and length-capped. If the request carries a session we attach the user id.
 */
export async function POST(request: NextRequest) {
  const { success } = await rateLimit(request, { limit: 30, windowMs: 60_000 })
  if (!success) return NextResponse.json({ ok: false }, { status: 429 })

  try {
    const body = await request.json().catch(() => ({}))

    let userId: string | null = null
    try {
      const supabase = createClient()
      const { data } = await supabase.auth.getUser()
      userId = data.user?.id ?? null
    } catch {
      // No session / cookie issues — record the error anyway, anonymously.
    }

    const str = (v: unknown, max: number) =>
      typeof v === 'string' && v.length > 0 ? v.slice(0, max) : null

    await recordEvent({
      type: 'error',
      level: 'error',
      source: 'client',
      route: str(body.route, 300),
      message: str(body.message, 2000) ?? 'Client error',
      stack: str(body.stack, 8000),
      digest: str(body.digest, 200),
      userId,
      userAgent: request.headers.get('user-agent'),
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }
}
