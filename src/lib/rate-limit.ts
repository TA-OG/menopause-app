import { NextRequest } from 'next/server'

const rateMap = new Map<string, { count: number; reset: number }>()

interface RateLimitOptions {
  limit: number        // max requests
  windowMs: number     // window in milliseconds
}

export function rateLimit(
  request: NextRequest,
  options: RateLimitOptions = { limit: 20, windowMs: 60_000 }
): { success: boolean; remaining: number } {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0] ??
    request.headers.get('x-real-ip') ??
    'unknown'

  const key = `${ip}:${request.nextUrl.pathname}`
  const now = Date.now()
  const entry = rateMap.get(key)

  if (!entry || now > entry.reset) {
    rateMap.set(key, { count: 1, reset: now + options.windowMs })
    return { success: true, remaining: options.limit - 1 }
  }

  entry.count++

  if (entry.count > options.limit) {
    return { success: false, remaining: 0 }
  }

  return { success: true, remaining: options.limit - entry.count }
}
