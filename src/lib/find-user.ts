import type { SupabaseClient, User } from '@supabase/supabase-js'

/** The subset of an auth user the admin flows need to make decisions. */
export interface FoundUser {
  id: string
  email: string | null
  /**
   * When they last signed in, or null if they never have — an invite that is
   * still sitting unaccepted in an inbox. Callers use this to decide whether
   * an account is usable *now* or whether work should be deferred to first
   * sign-in.
   */
  lastSignInAt: string | null
}

/**
 * Find an existing auth user by email address.
 *
 * Supabase's admin API has no "get user by email" endpoint, so this pages
 * through listUsers() and matches case-insensitively. Bounded to 10 pages of
 * 1000 (10k users) so a mistake here can never turn into an unbounded loop
 * against the auth API; it stops early as soon as a short page proves it has
 * reached the end.
 *
 * Requires a service-role client (`createAdminClient()`).
 */
export async function findUserByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<FoundUser | null> {
  const target = email.trim().toLowerCase()
  const perPage = 1000

  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) throw error

    const match = (data.users as User[]).find((u) => u.email?.toLowerCase() === target)
    if (match) {
      return {
        id: match.id,
        email: match.email ?? null,
        lastSignInAt: match.last_sign_in_at ?? null,
      }
    }

    if (data.users.length < perPage) break
  }

  return null
}

/** Convenience wrapper for callers that only need the id. */
export async function findUserIdByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<string | null> {
  const user = await findUserByEmail(admin, email)
  return user?.id ?? null
}
