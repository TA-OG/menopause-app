import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

const PROTECTED_ROUTES = ['/dashboard','/my-plan','/symptom-checkin','/journal','/learn','/profile','/pay','/onboarding']
const AUTH_ROUTES = ['/auth/sign-in', '/auth/sign-up']
// Public marketing/legal surface. These skip the Supabase session round-trip
// entirely — /blog, /sitemap.xml and /robots.txt are crawler-facing, and making
// an auth call per crawl request is pure waste.
const PUBLIC_ROUTES = ['/waitlist', '/terms', '/privacy', '/support', '/data-deletion', '/cookies', '/accessibility', '/offline', '/blog', '/sitemap.xml', '/robots.txt']

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const isPublic = PUBLIC_ROUTES.some((route) => pathname.startsWith(route))
  if (isPublic) return NextResponse.next()

  const { supabaseResponse, user } = await updateSession(request)
  const isProtected = PROTECTED_ROUTES.some((route) => pathname.startsWith(route))
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route))

  if (isProtected && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/sign-in'
    url.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(url)
  }

  if (isAuthRoute && user) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js|api/auth|api/stripe/webhook|api/cron).*)'],
}
