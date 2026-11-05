/**
 * Where to send someone after they sign in — kept on this site, always.
 *
 * Pure and dependency-free so the middleware (edge), the sign-in page
 * (browser) and the auth routes (node) can all share one definition. It lives
 * apart from post-sign-in.ts because that module pulls in Stripe.
 */

/** Cookie that carries the post-sign-in destination across the OAuth / magic-link round trip. */
export const AUTH_NEXT_COOKIE = 'auth_next'

/**
 * Long enough to finish a Google sign-in or fetch a magic link from an inbox,
 * short enough that an abandoned attempt cannot redirect a later, unrelated
 * sign-in.
 */
export const AUTH_NEXT_MAX_AGE_SECONDS = 10 * 60

const BASE = 'https://same-site.invalid'

/**
 * Resolve a post-sign-in redirect target that cannot leave the site.
 *
 * `next` arrives from a query string or a cookie, so it is attacker-controlled:
 * without this, a link could be reshaped into an open redirect that bounces a
 * freshly-authenticated woman to a look-alike site.
 *
 * The check parses the value the way a browser will, rather than pattern
 * matching the raw string: browsers drop tabs and newlines and read "\" as
 * "/", so "/\t/evil.example" and "/\\evil.example" both become
 * "//evil.example" — another host — by the time they are followed.
 *
 * /auth/ and /api/ paths are refused too: the first can only loop, and the
 * second would turn a sign-in link into a way to make her browser issue a
 * request she never chose.
 */
export function safeNext(next: string | null | undefined, fallback = '/dashboard'): string {
  if (typeof next !== 'string' || !next.startsWith('/')) return fallback

  let url: URL
  try {
    url = new URL(next, BASE)
  } catch {
    return fallback
  }

  if (url.origin !== BASE) return fallback
  if (/^\/(auth|api)(\/|$)/.test(url.pathname)) return fallback

  return `${url.pathname}${url.search}${url.hash}`
}
