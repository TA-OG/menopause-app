import type { SupabaseClient } from '@supabase/supabase-js'

export type AccessTier = 'free' | 'premium'

export interface UserAccess {
  /** True when the user has the admin/author role (profiles.is_admin). */
  isAdmin: boolean
  /** True only when the user actually pays for premium. */
  isPaidPremium: boolean
  /**
   * Effective premium access. Admins always get full access to every page,
   * article, and feature regardless of subscription — so all premium gates
   * should branch on this, not on subscription_tier directly.
   */
  isPremium: boolean
  /** Effective tier to feed tier-gated engines (admins resolve to 'premium'). */
  tier: AccessTier
}

/**
 * Resolve a user's effective access from their profile in a single query.
 *
 * Admins (is_admin = true) are treated as premium everywhere so the content
 * team (e.g. Pamela) can review every page and article without a paid
 * subscription. Use `isPaidPremium` only where billing truth matters
 * (e.g. the profile/billing page).
 */
export async function getUserAccess(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserAccess> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('subscription_tier, is_admin')
    .eq('id', userId)
    .single()

  const isAdmin = profile?.is_admin === true
  const isPaidPremium = profile?.subscription_tier === 'premium'
  const isPremium = isPaidPremium || isAdmin

  return {
    isAdmin,
    isPaidPremium,
    isPremium,
    tier: isPremium ? 'premium' : 'free',
  }
}
