/**
 * Summarising the admin invite log, per person rather than per row.
 *
 * ── Why this is not just `rows.filter(...).length` ───────────────────────────
 *
 * `admin_invites` is an append-only record of invite *attempts*, and one person
 * can legitimately have several: she was invited from the waitlist, then given
 * an access override, then — once resending existed — sent her link again
 * because the first attempt reached nobody.
 *
 * The dashboard headline reads "N invited · N active · N awaiting sign-in", and
 * the red banners read "N people were never emailed" / "N without premium".
 * Those are all statements about *people*. Counting rows answers a different
 * question and gets louder every time an admin does the right thing: resend a
 * link, and the same woman is counted twice — once as fixed and, permanently,
 * once as never emailed. A banner that can never go green is a banner that
 * stops being read.
 *
 * So each person is collapsed to one current state before anything is counted.
 *
 * Pure functions, no I/O: the API route reads the rows, this decides what they
 * mean, and `invite-log.test.ts` pins the rules.
 */

import type {
  ComplimentaryStatus,
  InviteEmailRecordStatus,
} from '@/lib/complimentary-premium-config'

/** The columns of an `admin_invites` row this module actually reads. */
export interface InviteLogRow {
  email: string
  email_status: InviteEmailRecordStatus
  complimentary_status: ComplimentaryStatus
  created_at: string
}

export interface InviteSummary {
  /** Distinct people invited — not the number of attempts. */
  total: number
  granted: number
  awaitingSignIn: number
  alreadySubscribed: number
  /** People who still have no complimentary premium and need a human. */
  failed: number
  /** People no invite email has ever reached. The most urgent failure. */
  noEmail: number
}

/**
 * How good an outcome each complimentary status represents, highest first.
 *
 * A grant that succeeded is not undone by a later attempt recording
 * 'not_attempted' — that value means "an earlier invite already scheduled her
 * months, so no second grant was created", which is a no-op, not a regression.
 * Taking the most recent row's status alone would therefore drop a woman out
 * of "awaiting sign-in" the moment her link was resent, making it look as
 * though her twelve months had evaporated.
 *
 * 'failed' ranks last deliberately: it counts only when nothing better ever
 * happened for that person, so a failure that was later put right stops being
 * reported as outstanding.
 */
const COMPLIMENTARY_RANK: Record<ComplimentaryStatus, number> = {
  granted: 5,
  already_subscribed: 4,
  activating: 3,
  pending_activation: 3,
  not_attempted: 2,
  failed: 1,
}

/** The state one person is currently in, across every invite they have. */
export interface InvitePersonState {
  email: string
  /**
   * The delivery outcome of their MOST RECENT attempt — the only one that
   * answers "does she have a working link right now?". Unlike the premium
   * grant, a later attempt genuinely supersedes an earlier one here: an email
   * that failed in August is irrelevant once September's arrived.
   */
  emailStatus: InviteEmailRecordStatus
  /** Their best complimentary outcome across all attempts (see the rank above). */
  complimentaryStatus: ComplimentaryStatus
}

/** People are the same person when their email matches, case-insensitively. */
function personKey(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * Collapse invite rows to one current state per person.
 *
 * Accepts rows in any order — the newest row per person is chosen by
 * `created_at` rather than by position, so a caller that changes its
 * `.order()` clause cannot silently invert the result.
 */
export function collapseInvitesByPerson<T extends InviteLogRow>(
  rows: readonly T[],
): InvitePersonState[] {
  const byPerson = new Map<string, InvitePersonState & { latestAt: number }>()

  for (const row of rows) {
    const key = personKey(row.email)
    // An unparseable or absent timestamp must not win the "most recent"
    // comparison by turning into NaN, which loses every comparison silently.
    const at = Date.parse(row.created_at)
    const when = Number.isNaN(at) ? -Infinity : at

    const existing = byPerson.get(key)

    if (!existing) {
      byPerson.set(key, {
        email: row.email,
        emailStatus: row.email_status,
        complimentaryStatus: row.complimentary_status,
        latestAt: when,
      })
      continue
    }

    if (when >= existing.latestAt) {
      existing.latestAt = when
      existing.emailStatus = row.email_status
      existing.email = row.email
    }

    if (
      COMPLIMENTARY_RANK[row.complimentary_status] >
      COMPLIMENTARY_RANK[existing.complimentaryStatus]
    ) {
      existing.complimentaryStatus = row.complimentary_status
    }
  }

  // Array.from rather than spreading the iterator: this project's tsconfig
  // targets ES5 without downlevelIteration, which rejects iterating a Map.
  return Array.from(byPerson.values()).map(({ latestAt: _latestAt, ...state }) => state)
}

/** Count the invite log the way the dashboard describes it: by person. */
export function summariseInvites(rows: readonly InviteLogRow[]): InviteSummary {
  const people = collapseInvitesByPerson(rows)

  return {
    total: people.length,
    granted: people.filter((p) => p.complimentaryStatus === 'granted').length,
    // 'activating' is a transient state during a sign-in; counted with pending
    // so a mid-flight person never looks like she went missing.
    awaitingSignIn: people.filter(
      (p) =>
        p.complimentaryStatus === 'pending_activation' ||
        p.complimentaryStatus === 'activating',
    ).length,
    alreadySubscribed: people.filter((p) => p.complimentaryStatus === 'already_subscribed').length,
    failed: people.filter((p) => p.complimentaryStatus === 'failed').length,
    // Counted separately from the grant failures above, and deliberately so:
    // someone whose twelve months are scheduled perfectly but who was never
    // emailed has no way into the app at all. That is the more urgent of the
    // two, and it used to be invisible here.
    noEmail: people.filter((p) => p.emailStatus === 'not_sent').length,
  }
}
