import type { SupabaseClient } from '@supabase/supabase-js'

export type GeoMode = 'disabled' | 'info_only' | 'full'

export type GeoReason =
  | 'admin_bypass'
  | 'override'
  | 'country_full'
  | 'country_info_only'
  | 'country_disabled'
  | 'unknown_country'
  | 'error'

export interface GeoAccess {
  /** Can the user use the app at all? (info_only and full are allowed; disabled is not.) */
  allowed: boolean
  mode: GeoMode
  /** Convenience: true only in 'full' mode — gate the personalised wellness plan on this. */
  personalisedAllowed: boolean
  reason: GeoReason
  country: string | null
}

function result(
  mode: GeoMode,
  reason: GeoReason,
  country: string | null,
): GeoAccess {
  return {
    mode,
    reason,
    country,
    allowed: mode === 'info_only' || mode === 'full',
    personalisedAllowed: mode === 'full',
  }
}

/**
 * Resolve a user's jurisdiction access mode.
 *
 * Order of precedence:
 *   1. Admin (profiles.is_admin) — always full; admins operate the app and
 *      manage geo settings from anywhere and must never be locked out.
 *   2. A non-expired per-user override — full (testers / beta pilots).
 *   3. The mode configured for the user's country in geo_restrictions.
 *   4. Unknown country (profile.country null, or no matching row) — fail OPEN
 *      to 'full'. This is a live app with existing paying users whose country
 *      may not be set; never block them on missing geolocation. The admin's
 *      per-country controls still apply to everyone we CAN locate.
 *   5. Any error — fail open to 'full'.
 *
 * Requires a service-role client (`createAdminClient()`); it reads is_admin
 * and the restrictions/overrides tables which RLS would otherwise hide.
 */
export async function getGeoAccess(
  admin: SupabaseClient,
  userId: string,
): Promise<GeoAccess> {
  try {
    const { data: profile } = await admin
      .from('profiles')
      .select('is_admin, country')
      .eq('id', userId)
      .maybeSingle()

    if (profile?.is_admin === true) {
      return result('full', 'admin_bypass', profile.country ?? null)
    }

    const { data: override } = await admin
      .from('geo_access_overrides')
      .select('expires_at')
      .eq('user_id', userId)
      .maybeSingle()

    if (override) {
      const expired =
        override.expires_at != null && new Date(override.expires_at) < new Date()
      if (!expired) return result('full', 'override', profile?.country ?? null)
    }

    const country = profile?.country ?? null
    if (!country) return result('full', 'unknown_country', null)

    const { data: restriction } = await admin
      .from('geo_restrictions')
      .select('mode')
      .eq('country_code', country.toUpperCase())
      .maybeSingle()

    // Country not in the table = not a market we've configured = fail open.
    const mode = (restriction?.mode as GeoMode | undefined) ?? 'full'
    const reason: GeoReason =
      mode === 'full'
        ? 'country_full'
        : mode === 'info_only'
        ? 'country_info_only'
        : 'country_disabled'
    return result(mode, reason, country)
  } catch (err) {
    console.error('[geo] getGeoAccess error:', err)
    // Infrastructure failure must never block users.
    return result('full', 'error', null)
  }
}
