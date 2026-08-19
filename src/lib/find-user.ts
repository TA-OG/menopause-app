import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Find an existing auth user's id by email address.
 *
 * Supabase's admin API has no "get user by email" endpoint, so this pages
 * through listUsers() and matches case-insensitively. Bounded to 10 pages of
 * 1000 (10k users) so a mistake here can never turn into an unbounded loop
 * against the auth API; it stops early as soon as a short page proves it has
 * reached the end.
 *
 * Requires a service-role client (`createAdminClient()`).
 */
export async function findUserIdByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<string | null> {
  const target = email.trim().toLowerCase()
  const perPage = 1000

  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) throw error

    const match = data.users.find((u) => u.email?.toLowerCase() === target)
    if (match) return match.id

    if (data.users.length < perPage) break
  }

  return null
}
