import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserAccess } from '@/lib/access'
import { applyTierGating } from '@/lib/wellness-engine'
import { localHourAndDate, flattenPlan, pickNext, truncate } from '@/lib/notification-schedule'
import type { WellnessPlan } from '@/types/database'
import webpush from 'web-push'

/**
 * Daily plan-drip notification cron.
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
 * Idempotency: `notification_log` is checked for a plan_drip already sent to
 * a user "today" in their own timezone, so overlapping or retried ticks
 * within the same local hour cannot double-send.
 */

// ─── Route ──────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  )

  const admin = createAdminClient()

  try {
    const { data: prefs } = await admin
      .from('user_preferences')
      .select('user_id, notification_hour, timezone')
      .eq('notification_enabled', true)

    if (!prefs || prefs.length === 0) {
      return NextResponse.json({ sent: 0, skipped: 0 })
    }

    let sent = 0
    let failed = 0
    let skipped = 0

    for (const pref of prefs) {
      const local = localHourAndDate(pref.timezone)
      // No timezone captured yet, or it's not this user's hour right now.
      if (!local || local.hour !== (pref.notification_hour ?? -1)) {
        skipped++
        continue
      }

      // Idempotency: has this user already had a plan_drip today, in their
      // own local date? Guards against overlapping/retried cron ticks within
      // the same local hour sending twice.
      const dayStartUtc = new Date(`${local.date}T00:00:00Z`)
      const { data: sentToday } = await admin
        .from('notification_log')
        .select('id')
        .eq('user_id', pref.user_id)
        .eq('kind', 'plan_drip')
        .gte('sent_at', dayStartUtc.toISOString())
        .limit(1)

      if (sentToday && sentToday.length > 0) {
        skipped++
        continue
      }

      const { data: subscriptions } = await admin
        .from('push_subscriptions')
        .select('*')
        .eq('user_id', pref.user_id)

      if (!subscriptions || subscriptions.length === 0) {
        skipped++
        continue
      }

      const { data: planRow } = await admin
        .from('wellness_plans')
        .select('*')
        .eq('user_id', pref.user_id)
        .eq('is_active', true)
        .single()

      if (!planRow) {
        skipped++
        continue
      }

      // Mirrors what the user actually sees on /my-plan — a free user must
      // never be pushed a supplement card or a recommendation outside their
      // visible top 3, which is exactly what applyTierGating enforces there.
      const access = await getUserAccess(admin, pref.user_id)
      const gatedPlan = applyTierGating(planRow as unknown as WellnessPlan, access.tier)
      const candidates = flattenPlan(gatedPlan)

      if (candidates.length === 0) {
        skipped++
        continue
      }

      const { data: history } = await admin
        .from('notification_log')
        .select('recommendation_id, sent_at')
        .eq('user_id', pref.user_id)
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
      if (!next) {
        skipped++
        continue
      }

      const payload = JSON.stringify({
        title: 'Aunty Mel',
        body: `${next.title} — ${truncate(next.body)}`,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-192x192.png',
        url: '/my-plan',
      })

      let deliveredToAny = false
      for (const sub of subscriptions) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          )
          deliveredToAny = true
        } catch (err: unknown) {
          failed++
          const statusCode = (err as { statusCode?: number })?.statusCode
          if (statusCode === 410) {
            await admin.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
          }
        }
      }

      if (deliveredToAny) {
        sent++
        await admin.from('notification_log').insert({
          user_id: pref.user_id,
          kind: 'plan_drip',
          recommendation_id: next.id,
        })
      }
    }

    return NextResponse.json({ sent, failed, skipped })
  } catch (err) {
    console.error('Cron notification error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
