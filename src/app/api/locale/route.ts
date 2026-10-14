import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sanitizeError } from '@/lib/sanitize-error'
import { rateLimit } from '@/lib/rate-limit'
import { isSupportedLocale } from '@/lib/locale-geo-map'

const LOCALE_COOKIE = 'NEXT_LOCALE'
const LOCALE_AUTO_COOKIE = 'NEXT_LOCALE_AUTO'
const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // 1 year

// Sets the visitor's language: explicit choices (switcher, onboarding) or a
// dismissal of the auto-detected banner. Always clears the "auto" marker —
// once a request lands here, the locale is no longer an unconfirmed guess.
export async function POST(request: NextRequest) {
  const { success } = await rateLimit(request, { limit: 20, windowMs: 60_000 })
  if (!success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  const body = await request.json().catch(() => ({}))
  const locale = body?.locale

  if (!isSupportedLocale(locale)) {
    return NextResponse.json({ error: 'Unsupported locale' }, { status: 400 })
  }

  // Persisting to the signed-in user's profile is a nice-to-have on top of
  // the cookie, not a prerequisite for it — an auth/DB hiccup here must
  // never block the core act of switching language, anonymous or not.
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('profiles').update({ locale }).eq('id', user.id)
    }
  } catch (err) {
    console.error('locale profile sync failed:', sanitizeError(err))
  }

  const response = NextResponse.json({ locale })
  response.cookies.set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: 'lax',
  })
  response.cookies.delete(LOCALE_AUTO_COOKIE)
  return response
}
