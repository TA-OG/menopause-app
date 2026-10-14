import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import {
  DEFAULT_LOCALE,
  isSupportedLocale,
  localeFromAcceptLanguage,
  localeFromCountry,
  type Locale,
} from '@/lib/locale-geo-map'

const PROTECTED_ROUTES = ['/dashboard','/my-plan','/symptom-checkin','/journal','/learn','/profile','/pay','/onboarding']
const AUTH_ROUTES = ['/auth/sign-in', '/auth/sign-up']
const PUBLIC_ROUTES = ['/waitlist', '/terms', '/privacy', '/support', '/data-deletion', '/cookies', '/accessibility', '/offline']

const LOCALE_COOKIE = 'NEXT_LOCALE'
const LOCALE_AUTO_COOKIE = 'NEXT_LOCALE_AUTO'
const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // 1 year

interface LocaleResolution {
  locale: Locale
  needsCookie: boolean
  isAuto: boolean
}

// Resolves the request locale without ever touching the database: an
// explicit NEXT_LOCALE cookie always wins (set by the user, onboarding, or
// a prior auto-detection) and is never re-evaluated — that's what makes an
// explicit "switch back" sticky instead of being overwritten by geo on the
// next request. Only when no cookie exists do we guess from IP country
// (Vercel's edge-injected x-vercel-ip-country header) or Accept-Language.
function resolveLocale(request: NextRequest): LocaleResolution {
  const existing = request.cookies.get(LOCALE_COOKIE)?.value
  if (isSupportedLocale(existing)) {
    return { locale: existing, needsCookie: false, isAuto: false }
  }

  const country = request.headers.get('x-vercel-ip-country')
  const geoLocale = localeFromCountry(country)
  const locale = geoLocale ?? localeFromAcceptLanguage(request.headers.get('accept-language'))

  return { locale, needsCookie: true, isAuto: locale !== DEFAULT_LOCALE }
}

function applyLocaleCookies(response: NextResponse, resolution: LocaleResolution): NextResponse {
  if (!resolution.needsCookie) return response

  response.cookies.set(LOCALE_COOKIE, resolution.locale, {
    path: '/',
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: 'lax',
  })

  if (resolution.isAuto) {
    response.cookies.set(LOCALE_AUTO_COOKIE, '1', {
      path: '/',
      maxAge: LOCALE_COOKIE_MAX_AGE,
      sameSite: 'lax',
    })
  }

  return response
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const localeResolution = resolveLocale(request)

  const isPublic = PUBLIC_ROUTES.some((route) => pathname.startsWith(route))
  if (isPublic) {
    return applyLocaleCookies(NextResponse.next(), localeResolution)
  }

  const { supabaseResponse, user } = await updateSession(request)
  const isProtected = PROTECTED_ROUTES.some((route) => pathname.startsWith(route))
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route))

  if (isProtected && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/sign-in'
    url.searchParams.set('redirectTo', pathname)
    return applyLocaleCookies(NextResponse.redirect(url), localeResolution)
  }

  if (isAuthRoute && user) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return applyLocaleCookies(NextResponse.redirect(url), localeResolution)
  }

  return applyLocaleCookies(supabaseResponse, localeResolution)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js|api/auth|api/stripe/webhook|api/cron).*)'],
}
