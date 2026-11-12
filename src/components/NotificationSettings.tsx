'use client'

import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'

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
  const t = useTranslations('Notifications')
  const locale = useLocale()
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [hour, setHour] = useState<number>(initialHour ?? 9)
  const [lastSavedHour, setLastSavedHour] = useState<number>(initialHour ?? 9)
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
        setError(t('errorPermission'))
        return
      }

      const registration = await navigator.serviceWorker.ready
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidKey) {
        setStatus('error')
        setError(t('errorNotConfigured'))
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
        // Don't leave a live browser subscription the server has no working
        // record of — otherwise the next mount's getSubscription() finds it
        // and shows "subscribed" even though notification_enabled was never
        // set and nothing will ever be sent to it.
        await subscription.unsubscribe().catch(() => {})
        // The API's message is English: log it, show hers.
        console.error('push subscribe failed:', res.status, data?.error)
        throw new Error('subscribe-failed')
      }

      setStatus('subscribed')
    } catch (err) {
      setStatus('error')
      console.error(err)
      setError(t('errorTurnOn'))
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
      console.error(err)
      setError(t('errorTurnOff'))
    }
  }

  if (status === 'unsupported') {
    return (
      <p className="text-sm text-gray-500">{t('unsupported')}</p>
    )
  }

  if (status === 'ios-needs-home-screen') {
    return (
      <p className="text-sm text-gray-500">{t('iosHomeScreen')}</p>
    )
  }

  const isSubscribed = status === 'subscribed'
  const isBusy = status === 'checking' || status === 'subscribing' || status === 'unsubscribing'

  async function saveHour(newHour: number) {
    setError(null)
    setHour(newHour)
    setHourSaved(false)
    try {
      const res = await fetch('/api/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notification_hour: newHour }),
      })
      if (!res.ok) throw new Error('Could not save your reminder time')
      setLastSavedHour(newHour)
      setHourSaved(true)
    } catch {
      // A silently-failed save left the picker showing an hour the server
      // never actually stored, with no indication anything went wrong —
      // revert to what's actually persisted and say so.
      setHour(lastSavedHour)
      setHourSaved(true)
      setError(t('errorHour'))
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-medium text-gray-900 text-sm">{t('title')}</p>
          <p className="text-xs text-gray-500 mt-0.5">{t('subtitle')}</p>
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
          {isBusy ? t('working') : isSubscribed ? t('turnOff') : t('turnOn')}
        </button>
      </div>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      {!initialEnabled && !isSubscribed && status === 'idle' && (
        <p className="text-xs text-gray-600 mt-2">{t('offByDefault')}</p>
      )}
      {isSubscribed && (
        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between gap-4">
          <label htmlFor="notification-hour" className="text-xs text-gray-600">
            {t('hourLabel')}
          </label>
          <select
            id="notification-hour"
            value={hour}
            onChange={(e) => saveHour(Number(e.target.value))}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1"
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {/* Each locale's own clock: 9 am in English, 09:00 in French/German. */}
                {new Date(2000, 0, 1, h).toLocaleTimeString(locale, { hour: 'numeric', minute: locale === 'en' ? undefined : '2-digit' })}
              </option>
            ))}
          </select>
          {!hourSaved && <span className="sr-only">{t('saving')}</span>}
        </div>
      )}
    </div>
  )
}
