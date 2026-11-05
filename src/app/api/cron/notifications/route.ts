import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  localHourAndDate,
  isCheckinNudgeDue,
  checkinNudgeMessage,
  type LocalMoment,
} from '@/lib/notification-schedule'
import type { PushSubscription } from '@/types/database'
import { recordEvent } from '@/lib/monitoring'
import webpush from 'web-push'

/**
 * Daily check-in reminder.
 *
 * One push a day, at the user's notification_hour (local to their timezone,
 * 9am unless they've picked another time on /profile): "How are you feeling
 * today?", linking to /symptom-checkin. Skipped if they've already checked
 * in for their local date. Only goes to users who opted in
 * (notification_enabled + a live push subscription).
 *
 * This replaced the earlier plan_drip push (one plan item per day) — one
 * notification a day, and it's the check-in.
 *
 * Intended to be called at least hourly by a scheduler rather than once a
 * day at a fixed UTC time — that's what makes "notification_hour, local to
 * the user's timezone" meaningful instead of a UTC hour every user happens
 * to share.
 *
 * Idempotency: a partial unique index on notification_log (user_id, kind,
 * local_date) for checkin_nudge (migration 040). Each tick claims the user's
 * local day by inserting that row *before* sending; a concurrent or retried
 * tick that reaches the same point hits a unique-violation and backs off
 * instead of sending a duplicate. A cheaper read-based check skips the
 * fan-out for users already known to be done for today, but the database
 * constraint — not that read — is what actually prevents a double-send.
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
    let errors = 0

    for (const pref of prefs) {
      const local = localHourAndDate(pref.timezone)
      // No timezone captured yet, or it's not this user's hour right now.
      if (!local || local.hour !== (pref.notification_hour ?? -1)) {
        skipped++
        continue
      }

      // Each user is isolated: an error for one (a DB hiccup, a missing
      // migration) must not abort the tick and silently drop every user
      // still to be processed. Failures are recorded to app_events and
      // counted in the response, never swallowed.
      try {
        const outcome = await sendCheckinNudge(admin, pref.user_id, local, pref.notification_hour)
        failed += outcome.failed
        if (outcome.delivered) sent++
        else if (outcome.failed === 0) skipped++
      } catch (err) {
        errors++
        await recordSendError(pref.user_id, err)
      }
    }

    // Everyone has been processed by now; a 500 still tells the scheduler (and
    // whoever reads its logs) that this tick wasn't clean, instead of one
    // user's error looking like a fully successful run.
    return NextResponse.json({ sent, failed, skipped, errors }, { status: errors > 0 ? 500 : 200 })
  } catch (err) {
    console.error('Cron notification error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// ─── Sender ─────────────────────────────────────────────────────────────────

type AdminClient = ReturnType<typeof createAdminClient>

interface SendOutcome {
  delivered: boolean
  failed: number
}

const NOT_SENT: SendOutcome = { delivered: false, failed: 0 }

async function recordSendError(userId: string, err: unknown): Promise<void> {
  console.error(`Cron checkin_nudge failed for user ${userId}:`, err)
  await recordEvent({
    type: 'error',
    route: '/api/cron/notifications',
    method: 'GET',
    message: `checkin_nudge send failed: ${err instanceof Error ? err.message : JSON.stringify(err)}`,
    stack: err instanceof Error ? err.stack ?? null : null,
    userId,
    meta: { kind: 'checkin_nudge' },
  })
}

/**
 * "How are you feeling today?" prompt linking to /symptom-checkin. Skipped
 * for anyone who has already logged a check-in for their local date —
 * nagging someone who has just done it is the fastest way to get push
 * turned off.
 */
async function sendCheckinNudge(
  admin: AdminClient,
  userId: string,
  local: LocalMoment,
  notificationHour: number | null
): Promise<SendOutcome> {
  // Idempotency pre-check — an optimization only; see the claim below.
  const { data: sentToday } = await admin
    .from('notification_log')
    .select('id')
    .eq('user_id', userId)
    .eq('kind', 'checkin_nudge')
    .eq('local_date', local.date)
    .limit(1)
  if (sentToday && sentToday.length > 0) return NOT_SENT

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
    return NOT_SENT
  }

  if (!isCheckinNudgeDue(local, notificationHour, !!checkin && checkin.length > 0)) return NOT_SENT

  const { data: subscriptions } = await admin
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', userId)
  if (!subscriptions || subscriptions.length === 0) return NOT_SENT

  // Claim this user's local day before sending, not after. The partial unique
  // index on (user_id, kind, local_date) — migration 040 — is what actually
  // makes a double-send impossible: if a concurrent or retried tick reached
  // this same point, its insert hits a 23505 unique-violation and it backs
  // off instead of sending a duplicate.
  const { error: claimError } = await admin.from('notification_log').insert({
    user_id: userId,
    kind: 'checkin_nudge',
    local_date: local.date,
  })
  if (claimError) {
    if (claimError.code === '23505') return NOT_SENT
    throw claimError
  }

  // Her language, not the server's. A failed lookup falls back to English:
  // a reminder in the wrong language beats a crashed send.
  const { data: profile } = await admin
    .from('profiles')
    .select('locale')
    .eq('id', userId)
    .maybeSingle()
  const message = checkinNudgeMessage(profile?.locale)

  const payload = JSON.stringify({
    title: message.title,
    body: message.body,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    url: message.url,
  })

  let delivered = false
  let failed = 0
  for (const sub of subscriptions as PushSubscription[]) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      )
      delivered = true
    } catch (err: unknown) {
      failed++
      const statusCode = (err as { statusCode?: number })?.statusCode
      if (statusCode === 410) {
        await admin.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
      }
    }
  }

  // The day stays claimed even if delivery failed to every subscription — no
  // retry today. Acceptable for a soft reminder: retrying would reopen the
  // exact double-send race the claim exists to close, and it resumes
  // tomorrow regardless.
  return { delivered, failed }
}
