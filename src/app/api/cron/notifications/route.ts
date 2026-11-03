import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserAccess } from '@/lib/access'
import { applyTierGating } from '@/lib/wellness-engine'
import {
  localHourAndDate,
  flattenPlan,
  pickNext,
  truncate,
  isCheckinNudgeDue,
  CHECKIN_NUDGE_HOUR,
  CHECKIN_NUDGE_MESSAGE,
  type LocalMoment,
} from '@/lib/notification-schedule'
import type { PushSubscription, WellnessPlan } from '@/types/database'
import webpush from 'web-push'

/**
 * Daily notification cron: plan drip + check-in prompt.
 *
 * Two independent once-per-local-day sends, each with its own claim in
 * notification_log:
 *   - plan_drip      at the user's notification_hour — one item from their plan
 *   - checkin_nudge  at CHECKIN_NUDGE_HOUR local — "how are you feeling
 *                    today?", skipped if they've already checked in today
 *
 * Both only go to users who opted in (notification_enabled + a live push
 * subscription); there is no separate toggle for the check-in prompt.
 *
 * Rewritten from a version that selected `notification_hour` but never
 * filtered on it (every enabled user got pushed on every cron tick,
 * regardless of their chosen hour), sent one of five hardcoded generic
 * strings unrelated to anyone's actual plan, and had no scheduler wired up
 * to call it at all.
 *
 * Intended to run frequently (e.g. every 15 min via pg_cron) rather than
 * once a day at a fixed UTC time — that's what makes "notification_hour,
 * local to the user's timezone" meaningful instead of a UTC hour every user
 * happens to share.
 *
 * Idempotency: `notification_log.local_date` (migration 030) carries a unique
 * index on (user_id, kind, local_date) for plan_drip, and migration 040 the
 * same for checkin_nudge. Each tick claims the
 * user's local day by inserting that row *before* sending; a concurrent or
 * retried tick that reaches the same point hits a unique-violation and backs
 * off instead of sending a duplicate. A cheaper read-based check earlier in
 * the loop skips the fan-out for users already known to be done for today,
 * but the database constraint — not that read — is what actually prevents a
 * double-send.
 */

// ─── Route ──────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  // Checked separately from the header comparison below: if CRON_SECRET were
  // ever unset, `Bearer ${undefined}` becomes the literal string
  // "Bearer undefined", which a caller could send verbatim and pass the
  // comparison. Failing closed here means a missing secret can only ever
  // reject every caller, never accidentally authenticate one.
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  )

  const admin = createAdminClient()

  try {
    const { data: prefs, error: prefsError } = await admin
      .from('user_preferences')
      .select('user_id, notification_hour, timezone')
      .eq('notification_enabled', true)

    // A query error here (missing column, broken RLS, connection issue —
    // this was caught live when a schema migration hadn't actually been
    // applied yet) must not be indistinguishable from "genuinely zero
    // enabled users". Discarding it silently turned a broken cron into a
    // false "0 sent" success on every tick.
    if (prefsError) throw prefsError

    if (!prefs || prefs.length === 0) {
      return NextResponse.json({ sent: 0, skipped: 0 })
    }

    let sent = 0
    let failed = 0
    let skipped = 0

    for (const pref of prefs) {
      const local = localHourAndDate(pref.timezone)
      // No timezone captured yet — never guess (see localHourAndDate).
      if (!local) {
        skipped++
        continue
      }

      const planDripHour = local.hour === (pref.notification_hour ?? -1)
      const checkinHour = local.hour === CHECKIN_NUDGE_HOUR
      if (!planDripHour && !checkinHour) {
        skipped++
        continue
      }

      const { data: subscriptionRows } = await admin
        .from('push_subscriptions')
        .select('*')
        .eq('user_id', pref.user_id)

      // Mutable: deliver() drops endpoints the push service reports as gone
      // (410), so a second send in this same tick doesn't retry them.
      let subscriptions = subscriptionRows ?? []
      if (subscriptions.length === 0) {
        skipped++
        continue
      }

      if (planDripHour) {
        const outcome = await sendPlanDrip(admin, pref.user_id, local.date, subscriptions)
        subscriptions = outcome.live
        failed += outcome.failed
        if (outcome.delivered) sent++
        else if (outcome.failed === 0) skipped++
      }

      if (checkinHour && subscriptions.length > 0) {
        const outcome = await sendCheckinNudge(admin, pref.user_id, local, subscriptions)
        subscriptions = outcome.live
        failed += outcome.failed
        if (outcome.delivered) sent++
        else if (outcome.failed === 0) skipped++
      }
    }

    return NextResponse.json({ sent, failed, skipped })
  } catch (err) {
    console.error('Cron notification error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// ─── Senders ────────────────────────────────────────────────────────────────

type AdminClient = ReturnType<typeof createAdminClient>
type ReminderKind = 'plan_drip' | 'checkin_nudge'

interface SendOutcome {
  delivered: boolean
  failed: number
  /** Subscriptions still valid after this send (410-gone ones removed). */
  live: PushSubscription[]
}

const NOT_SENT = (live: PushSubscription[]): SendOutcome => ({ delivered: false, failed: 0, live })

/**
 * Claim this user's local day for `kind` before sending, not after. The
 * partial unique indexes on (user_id, kind, local_date) — migration 030 for
 * plan_drip, 040 for checkin_nudge — are what actually make a double-send
 * impossible: if a concurrent or retried tick reached this same point, its
 * insert hits a 23505 unique-violation and it backs off instead of sending a
 * duplicate. Logging after sending (the original approach) left a window
 * where two overlapping ticks could both pass the read check before either
 * had written a row.
 *
 * Returns false when another tick already holds the claim.
 */
async function claimLocalDay(
  admin: AdminClient,
  userId: string,
  kind: ReminderKind,
  localDate: string,
  recommendationId: string | null = null
): Promise<boolean> {
  const { error } = await admin.from('notification_log').insert({
    user_id: userId,
    kind,
    recommendation_id: recommendationId,
    local_date: localDate,
  })
  if (!error) return true
  if (error.code === '23505') return false
  throw error
}

/**
 * Idempotency pre-check: has this user already had `kind` logged for their
 * local calendar date? An optimization only, to avoid the fan-out for a user
 * already known to be done for today — NOT what makes double-sending
 * impossible (that is claimLocalDay's unique index).
 */
async function alreadySentToday(
  admin: AdminClient,
  userId: string,
  kind: ReminderKind,
  localDate: string
): Promise<boolean> {
  const { data } = await admin
    .from('notification_log')
    .select('id')
    .eq('user_id', userId)
    .eq('kind', kind)
    .eq('local_date', localDate)
    .limit(1)
  return !!data && data.length > 0
}

async function deliver(
  admin: AdminClient,
  subscriptions: PushSubscription[],
  payload: string
): Promise<SendOutcome> {
  let delivered = false
  let failed = 0
  const live: PushSubscription[] = []
  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      )
      delivered = true
      live.push(sub)
    } catch (err: unknown) {
      failed++
      const statusCode = (err as { statusCode?: number })?.statusCode
      if (statusCode === 410) {
        await admin.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
      } else {
        live.push(sub)
      }
    }
  }
  // The day stays claimed even if delivery failed to every subscription — no
  // retry today. Acceptable for a soft engagement nudge: retrying would reopen
  // the exact double-send race the claim exists to close, and it resumes
  // tomorrow regardless.
  return { delivered, failed, live }
}

/** One item from the user's tier-gated plan, least recently sent first. */
async function sendPlanDrip(
  admin: AdminClient,
  userId: string,
  localDate: string,
  subscriptions: PushSubscription[]
): Promise<SendOutcome> {
  if (await alreadySentToday(admin, userId, 'plan_drip', localDate)) return NOT_SENT(subscriptions)

  const { data: planRow } = await admin
    .from('wellness_plans')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .single()

  if (!planRow) return NOT_SENT(subscriptions)

  // Mirrors what the user actually sees on /my-plan — a free user must
  // never be pushed a supplement card or a recommendation outside their
  // visible top 3, which is exactly what applyTierGating enforces there.
  const access = await getUserAccess(admin, userId)
  const gatedPlan = applyTierGating(planRow as unknown as WellnessPlan, access.tier)
  const candidates = flattenPlan(gatedPlan)

  if (candidates.length === 0) return NOT_SENT(subscriptions)

  const { data: history } = await admin
    .from('notification_log')
    .select('recommendation_id, sent_at')
    .eq('user_id', userId)
    .eq('kind', 'plan_drip')
    .not('recommendation_id', 'is', null)
    .order('sent_at', { ascending: false })
    .limit(200)

  const lastSentAt = new Map<string, string>()
  for (const row of history ?? []) {
    // First occurrence per id wins because the query is already sorted
    // most-recent-first.
    if (row.recommendation_id && !lastSentAt.has(row.recommendation_id)) {
      lastSentAt.set(row.recommendation_id, row.sent_at)
    }
  }

  const next = pickNext(candidates, lastSentAt)
  if (!next) return NOT_SENT(subscriptions)

  if (!(await claimLocalDay(admin, userId, 'plan_drip', localDate, next.id))) {
    return NOT_SENT(subscriptions)
  }

  return deliver(
    admin,
    subscriptions,
    JSON.stringify({
      title: 'Aunty Mel',
      body: `${next.title} — ${truncate(next.body)}`,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      url: '/my-plan',
    })
  )
}

/**
 * Evening "how are you feeling today?" prompt linking to /symptom-checkin.
 * Skipped for anyone who has already logged a check-in for their local date
 * — nagging someone who has just done it is the fastest way to get push
 * turned off.
 */
async function sendCheckinNudge(
  admin: AdminClient,
  userId: string,
  local: LocalMoment,
  subscriptions: PushSubscription[]
): Promise<SendOutcome> {
  if (await alreadySentToday(admin, userId, 'checkin_nudge', local.date)) return NOT_SENT(subscriptions)

  // checkin_date is the user's device-local date (symptom-checkin page uses
  // localCalendarDate), the same calendar as local.date here.
  const { data: checkin, error: checkinError } = await admin
    .from('symptom_checkins')
    .select('id')
    .eq('user_id', userId)
    .eq('checkin_date', local.date)
    .limit(1)

  // If we can't tell whether they've checked in, don't nudge: a missed
  // prompt is harmless, a wrong one after they've just logged is not.
  if (checkinError) {
    console.error('Check-in lookup failed; skipping check-in nudge:', checkinError)
    return NOT_SENT(subscriptions)
  }

  if (!isCheckinNudgeDue(local, !!checkin && checkin.length > 0)) return NOT_SENT(subscriptions)

  if (!(await claimLocalDay(admin, userId, 'checkin_nudge', local.date))) {
    return NOT_SENT(subscriptions)
  }

  return deliver(
    admin,
    subscriptions,
    JSON.stringify({
      title: CHECKIN_NUDGE_MESSAGE.title,
      body: CHECKIN_NUDGE_MESSAGE.body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      url: CHECKIN_NUDGE_MESSAGE.url,
    })
  )
}
