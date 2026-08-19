import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sanitizeError } from '@/lib/sanitize-error'
import { rateLimit } from '@/lib/rate-limit'
import { z } from 'zod'

const SubscribeSchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
  // Captured client-side via Intl.DateTimeFormat().resolvedOptions().timeZone
  // at the moment the user opts in — the most reliable timezone signal
  // available, and independent of whether they filled in the optional
  // onboarding timezone field. notification_hour (migration 003) is only
  // meaningful once it has a timezone to be local to.
  timezone: z.string().min(1).max(100).optional(),
})

export async function POST(request: NextRequest) {
  const { success } = await rateLimit(request, { limit: 5, windowMs: 60_000 })
  if (!success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const parsed = SubscribeSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid subscription data' }, { status: 400 })
    }

    const { timezone, ...subscriptionFields } = parsed.data

    const { data, error } = await supabase
      .from('push_subscriptions')
      .upsert(
        { user_id: user.id, ...subscriptionFields },
        { onConflict: 'endpoint' }
      )
      .select()
      .single()

    if (error) throw error

    // notification_hour has no DB default (migration 003) and nothing sets
    // one until the user touches the picker on /profile. Without a fallback
    // here, the cron's `local.hour !== (notification_hour ?? -1)` check can
    // never match for a first-time subscriber, and they'd silently never
    // receive a single drip notification until they happened to open
    // settings and pick an hour themselves. Read first so an existing choice
    // (or a second device subscribing) is never clobbered back to the
    // default, and so an existing timezone is never blanked by nothing.
    const { data: existingPrefs } = await supabase
      .from('user_preferences')
      .select('notification_hour, timezone')
      .eq('user_id', user.id)
      .maybeSingle()

    const { error: prefsError } = await supabase
      .from('user_preferences')
      .upsert(
        {
          user_id: user.id,
          notification_enabled: true,
          notification_hour: existingPrefs?.notification_hour ?? 9,
          timezone: timezone ?? existingPrefs?.timezone ?? null,
        },
        { onConflict: 'user_id' }
      )

    // If this write fails, the push subscription is saved but
    // notification_enabled never flips on — the cron would never select this
    // user while the client shows the toggle as successfully turned on. Fail
    // the request so the client rolls back instead of showing a false "on".
    if (prefsError) throw prefsError

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const endpoint = searchParams.get('endpoint')

  if (!endpoint) return NextResponse.json({ error: 'endpoint required' }, { status: 400 })

  await supabase
    .from('push_subscriptions')
    .delete()
    .eq('user_id', user.id)
    .eq('endpoint', endpoint)

  // If that was the user's only subscription, turn notification_enabled back
  // off — otherwise the cron keeps counting them as opted in with nothing to
  // actually send to, and a later interval-reminder feature that doesn't key
  // off push_subscriptions at all would wrongly treat them as subscribed.
  const { count } = await supabase
    .from('push_subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)

  if (!count) {
    await supabase
      .from('user_preferences')
      .update({ notification_enabled: false })
      .eq('user_id', user.id)
  }

  return NextResponse.json({ success: true })
}
