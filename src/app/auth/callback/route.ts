import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { completeSignIn } from '@/lib/post-sign-in'
import { AUTH_NEXT_COOKIE, safeNext } from '@/lib/safe-redirect'

/**
 * /auth/callback — where every completed sign-in lands.
 *
 * Supabase hands the session back in one of three shapes, and all three have
 * to work or someone is locked out:
 *
 *   ?code=…        PKCE. A magic link or OAuth sign-in the user started in
 *                  their own browser, which holds the code verifier.
 *
 *   ?token_hash=…  The server-side email-link flow, used when the Supabase
 *     &type=…      email template points straight at this route. An admin
 *                  invite has no verifier in the invitee's browser, so this
 *                  is the shape it can use.
 *
 *   #access_token= The default email template's flow. The tokens are in the
 *                  URL fragment, which browsers never send to the server —
 *                  so this route cannot read them and hands off to
 *                  /auth/complete, a client page that can. The fragment
 *                  survives the redirect because the Location carries none
 *                  of its own.
 *
 * Only the first was handled before, so an invited user following the link in
 * her invite email was bounced to an error page and her complimentary premium
 * never started.
 *
 * Where she goes afterwards comes from `?next=` or, failing that, the
 * AUTH_NEXT_COOKIE the sign-in page set — the page she was trying to reach
 * when she was asked to sign in. The cookie exists so the callback URL sent to
 * Supabase never needs a query string: Supabase matches its Redirect URLs
 * allow-list against the whole URL, so an exact production entry would reject
 * `/auth/callback?next=…` and sign-in would silently fall back to the Site URL.
 * Every response clears the cookie, so it is used at most once.
 */

const EMAIL_OTP_TYPES: EmailOtpType[] = [
  'invite',
  'magiclink',
  'recovery',
  'signup',
  'email_change',
  'email',
]

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const next = searchParams.get('next') ?? readNextCookie()
  const refCode = searchParams.get('ref')

  // An error handed back by Supabase itself (expired or already-used link).
  // Surface its reason rather than a generic failure.
  const providerError = searchParams.get('error_description') ?? searchParams.get('error')

  const supabase = createClient()

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return clearNext(await redirectAfterSignIn(supabase, origin, next, refCode))
  } else if (tokenHash && type && EMAIL_OTP_TYPES.includes(type as EmailOtpType)) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as EmailOtpType,
      token_hash: tokenHash,
    })
    if (!error) return clearNext(await redirectAfterSignIn(supabase, origin, next, refCode))
  } else if (!providerError) {
    // No credential in the query string at all. Either the tokens are in the
    // fragment — invisible here — or this was a stray visit. Hand off to the
    // client page, which can tell the two apart; it sends a genuine stray
    // visit back to sign-in itself.
    const handoff = new URL('/auth/complete', origin)
    if (next) handoff.searchParams.set('next', safeNext(next))
    if (refCode) handoff.searchParams.set('ref', refCode)
    return clearNext(NextResponse.redirect(handoff))
  }

  // Back to sign-in with the destination intact, so a retry still lands her
  // where she was going.
  const failure = new URL('/auth/sign-in', origin)
  failure.searchParams.set('error', providerError ?? 'auth_callback_failed')
  if (next) failure.searchParams.set('redirectTo', safeNext(next))
  return clearNext(NextResponse.redirect(failure))
}

function readNextCookie(): string | null {
  const raw = cookies().get(AUTH_NEXT_COOKIE)?.value
  if (!raw) return null
  try {
    return decodeURIComponent(raw)
  } catch {
    return null
  }
}

function clearNext(response: NextResponse): NextResponse {
  response.cookies.delete(AUTH_NEXT_COOKIE)
  return response
}

async function redirectAfterSignIn(
  supabase: ReturnType<typeof createClient>,
  origin: string,
  next: string | null,
  refCode: string | null,
) {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.redirect(`${origin}${safeNext(next)}`)

  const destination = await completeSignIn(supabase, createAdminClient(), user, {
    next,
    refCode,
  })

  return NextResponse.redirect(`${origin}${destination}`)
}
