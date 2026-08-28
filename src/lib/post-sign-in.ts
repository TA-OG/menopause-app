import type { SupabaseClient, User } from '@supabase/supabase-js'
import { claimReferral } from '@/lib/referral-rewards'
import { activatePendingComplimentaryPremium } from '@/lib/complimentary-premium'

/**
 * The work that must run every time someone completes a sign-in, whichever
 * route they arrived through.
 *
 * There is more than one such route, and that is the point of this module.
 * A magic link the user requested themselves comes back as `?code=`, but an
 * invite generated server-side by an admin has no PKCE verifier in the
 * invitee's browser, so Supabase returns the session another way — either
 * `?token_hash=` (when the email template points at us) or in the URL
 * fragment (the default template), which a server route can never see.
 * Before this existed only the `?code=` path ran the steps below, so an
 * invited woman could accept her invite and still never have her
 * complimentary premium started.
 */

/**
 * Resolve a post-sign-in redirect target that cannot leave the site.
 *
 * `next` arrives from the query string, so it is attacker-controlled: without
 * this an invite link could be reshaped into an open redirect that bounces a
 * freshly-authenticated woman to a look-alike site. Only a plain absolute path
 * is allowed — no scheme, no host, and no protocol-relative "//evil.com".
 */
export function safeNext(next: string | null | undefined, fallback = '/dashboard'): string {
  if (!next) return fallback
  if (!next.startsWith('/')) return fallback
  if (next.startsWith('//')) return fallback
  // Backslashes are treated as slashes by some browsers when resolving URLs.
  if (next.startsWith('/\\')) return fallback
  return next
}

/**
 * Claim any referral, start any pending complimentary premium, and work out
 * where to send the user next.
 *
 * Both side effects are safe to run on every sign-in and are no-ops once there
 * is nothing outstanding — they are deliberately called on each login rather
 * than only on the first.
 *
 * Never throws: a billing or referral problem must not keep someone out of a
 * health app they have just authenticated into. Failures are logged by the
 * functions themselves and recorded on the invite row for follow-up.
 *
 * `admin` must be a service-role client.
 */
export async function completeSignIn(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  user: User,
  opts: { next?: string | null; refCode?: string | null } = {},
): Promise<string> {
  const referralCodeUsed =
    opts.refCode ?? (user.user_metadata?.referral_code as string | undefined) ?? null

  if (referralCodeUsed) {
    await claimReferral(admin, user.id, referralCodeUsed)
  }

  if (user.email) {
    await activatePendingComplimentaryPremium(admin, user.id, user.email)
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_complete')
    .eq('id', user.id)
    .maybeSingle()

  if (profile && !profile.onboarding_complete) return '/onboarding'

  return safeNext(opts.next)
}
