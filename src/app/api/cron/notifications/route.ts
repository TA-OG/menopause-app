import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import webpush from 'web-push'

const DAILY_MESSAGES = [
  "How are you feeling today? Log your symptoms and track your progress. 🌸",
  "Small changes add up. Have you tried your wellness plan today? ✨",
  "Your body is doing its best. Check in and see how far you've come. 💪",
  "A moment for you — log today's check-in and keep building your picture. 📊",
  "Aunty Mel is thinking of you. How are you doing today? 🌿",
]

export async function GET(request: NextRequest) {
  // Verify cron secret to prevent unauthorised calls
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
    // Get all users with push subscriptions and notifications enabled
    const { data: prefs } = await admin
      .from('user_preferences')
      .select('user_id, notification_hour')
      .eq('notification_enabled', true)

    if (!prefs || prefs.length === 0) {
      return NextResponse.json({ sent: 0 })
    }

    const userIds = prefs.map((p) => p.user_id)

    const { data: subscriptions } = await admin
      .from('push_subscriptions')
      .select('*')
      .in('user_id', userIds)

    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json({ sent: 0 })
    }

    const message = DAILY_MESSAGES[Math.floor(Math.random() * DAILY_MESSAGES.length)]
    let sent = 0
    let failed = 0

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({
            title: 'Aunty Mel',
            body: message,
            icon: '/icons/icon-192x192.png',
            badge: '/icons/icon-192x192.png',
            url: '/symptom-checkin',
          })
        )
        sent++
      } catch (err: any) {
        failed++
        // 410 Gone = subscription expired, clean it up
        if (err?.statusCode === 410) {
          await admin
            .from('push_subscriptions')
            .delete()
            .eq('endpoint', sub.endpoint)
        }
      }
    }

    return NextResponse.json({ sent, failed })
  } catch (err) {
    console.error('Cron notification error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
