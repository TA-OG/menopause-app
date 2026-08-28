/**
 * Policy constants and status types for the complimentary premium that
 * accompanies an admin invite.
 *
 * Deliberately free of any Stripe or Supabase dependency, so the admin UI can
 * import the same values the server acts on rather than restating them. The
 * implementation lives in complimentary-premium.ts, which is server-only
 * (it constructs a Stripe client at module scope) and re-exports everything
 * here so existing imports keep working.
 */

/** Length of the complimentary premium period granted with an admin invite. */
export const COMPLIMENTARY_PREMIUM_MONTHS = 12

/** Recorded on an invite whose complimentary months start at first sign-in. */
export const PENDING_ACTIVATION = 'pending_activation' as const

/** The outcomes grantComplimentaryPremium can resolve to. */
export type ComplimentaryGrantStatus = 'granted' | 'already_subscribed' | 'failed'

/** Statuses an invite's complimentary grant can be recorded with. */
export type ComplimentaryRecordStatus =
  | typeof PENDING_ACTIVATION
  | ComplimentaryGrantStatus
  | 'not_attempted'

/**
 * Every value admin_invites.complimentary_status can hold — the record
 * statuses above plus 'activating', which only ever exists transiently while a
 * sign-in is running the deferred grant (migration 032). Readers of the table
 * must handle it; writers of a new row never set it.
 */
export type ComplimentaryStatus = ComplimentaryRecordStatus | 'activating'

/** The kinds of invite recorded in admin_invites (migrations 031 and 033). */
export type InviteKind = 'waitlist' | 'author' | 'access_override'
