'use client'

import { useEffect, useState } from 'react'

interface Props {
  initialEnabled: boolean
  initialHour: number | null
}

/**
 * Push notification opt-in toggle.
 *
 * Nothing in the app called navigator.serviceWorker or PushManager before
 * this — /api/push/subscribe existed but had no client calling it, and
 * public/sw.js didn't exist for the registration in layout.tsx to find.
 * This is the missing client half.
 *
 * Deliberately handles permission state explicitly rather than assuming:
 * iOS Safari only grants push permission to a PWA added to the Home Screen
 * (iOS 16.4+), so a plain browser tab needs to be told that rather than
 * fail with a silent, confusing rejection.
 */
function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const output = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) {
    output[i] = rawData.charCodeAt(i)
  }
  return output
}

type Status = 'idle' | 'checking' | 'subscribing' | 'subscribed' | 'unsubscribing' | 'error' | 'unsupported' | 'ios-needs-home-screen'

export default function NotificationSettings({ initialEnabled, initialHour }: Props) {
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [hour, setHour] = useState<number>(initialHour ?? 9)
  const [hourSaved, setHourSaved] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function checkState() {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        setStatus('unsupported')
        return
      }

      // iOS Safari (not installed as a PWA) has Notification/PushManager
      // present but permission requests are silently rejected — detect and
      // explain rather than let the user hit a confusing dead end.
      const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true
      if (isIos && !isStandalone) {
        setStatus('ios-needs-home-screen')
        return
      }

      setStatus('checking')
      try {
        const registration = await navigator.serviceWorker.register('/sw.js')
        const existing = await registration.pushManager.getSubscription()
        if (!cancelled) setStatus(existing ? 'subscribed' : 'idle')
      } catch {
        if (!cancelled) setStatus('idle')
      }
    }

    checkState()
    return () => {
      cancelled = true
    }
  }, [])

  async function subscribe() {
    setError(null)
    setStatus('subscribing')
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setStatus('idle')
        setError('Notifications need to be allowed in your browser to turn this on.')
        return
      }

      const registration = await navigator.serviceWorker.ready
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidKey) {
        setStatus('error')
        setError('Notifications are not configured yet — check back soon.')
        return
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })

      const json = subscription.toJSON()
      let timezone: string | undefined
      try {
        timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
      } catch {
        // Some very old browsers lack Intl.DateTimeFormat timezone support —
        // fine to proceed without it, the cron just can't localise for them
        // until they set one via onboarding.
      }

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: json.endpoint,
          p256dh: json.keys?.p256dh,
          auth: json.keys?.auth,
          timezone,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error ?? 'Could not save subscription')
      }

      setStatus('subscribed')
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Something went wrong turning on notifications.')
    }
  }

  async function unsubscribe() {
    setError(null)
    setStatus('unsubscribing')
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()

      if (subscription) {
        const endpoint = subscription.endpoint
        await subscription.unsubscribe()
        await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(endpoint)}`, {
          method: 'DELETE',
        })
      }

      setStatus('idle')
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Something went wrong turning off notifications.')
    }
  }

  if (status === 'unsupported') {
    return (
      <p className="text-sm text-gray-500">
        Push notifications aren&apos;t supported in this browser.
      </p>
    )
  }

  if (status === 'ios-needs-home-screen') {
    return (
      <p className="text-sm text-gray-500">
        On iPhone or iPad, add Aunty Mel to your Home Screen first (Share →
        Add to Home Screen) — iOS only allows notifications for apps opened
        that way, not from a regular browser tab.
      </p>
    )
  }

  const isSubscribed = status === 'subscribed'
  const isBusy = status === 'checking' || status === 'subscribing' || status === 'unsubscribing'

  async function saveHour(newHour: number) {
    setHour(newHour)
    setHourSaved(false)
    try {
      const res = await fetch('/api/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notification_hour: newHour }),
      })
      if (res.ok) setHourSaved(true)
    } catch {
      // Non-critical — the picker just won't show "saved" until the next
      // successful attempt. Not worth surfacing an error banner for.
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-medium text-gray-900 text-sm">Push notifications</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Daily plan reminders and check-in nudges
          </p>
        </div>
        <button
          type="button"
          onClick={isSubscribed ? unsubscribe : subscribe}
          disabled={isBusy}
          className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
            isSubscribed
              ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              : 'bg-brand-900 text-white hover:bg-brand-800'
          } disabled:opacity-50`}
        >
          {isBusy ? 'Working…' : isSubscribed ? 'Turn off' : 'Turn on'}
        </button>
      </div>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      {!initialEnabled && !isSubscribed && status === 'idle' && (
        <p className="text-xs text-gray-400 mt-2">
          Off by default — turn on to get reminders from your plan.
        </p>
      )}
      {isSubscribed && (
        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between gap-4">
          <label htmlFor="notification-hour" className="text-xs text-gray-600">
            Send my daily reminder around
          </label>
          <select
            id="notification-hour"
            value={hour}
            onChange={(e) => saveHour(Number(e.target.value))}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1"
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`}
              </option>
            ))}
          </select>
          {!hourSaved && <span className="sr-only">Saving…</span>}
        </div>
      )}
    </div>
  )
}
