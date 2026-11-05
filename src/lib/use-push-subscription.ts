'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * Browser half of push opt-in, shared by the /profile toggle, the onboarding
 * reminders step and the dashboard opt-in banner, so all three detect support
 * and subscribe in exactly the same way.
 *
 * Push can't be switched on for anyone silently: the browser only grants
 * permission from a user gesture, so subscribe() must be called from a click
 * handler. iOS Safari only grants it to a PWA added to the Home Screen
 * (iOS 16.4+), so a plain browser tab is reported as 'ios-needs-home-screen'
 * rather than left to fail with a silent, confusing rejection.
 */

export type PushStatus =
  | 'idle'
  | 'checking'
  | 'subscribing'
  | 'subscribed'
  | 'unsubscribing'
  | 'error'
  | 'unsupported'
  | 'ios-needs-home-screen'

/**
 * What went wrong, as a code rather than a sentence: the app is translated,
 * so each screen turns this into its own locale's message (the
 * Notifications.error* keys in messages/*.json).
 */
export type PushErrorCode = 'permission' | 'not-configured' | 'turn-on' | 'turn-off'

/** The Notifications.* message key for each error code. */
export const PUSH_ERROR_MESSAGE_KEY: Record<PushErrorCode, string> = {
  permission: 'errorPermission',
  'not-configured': 'errorNotConfigured',
  'turn-on': 'errorTurnOn',
  'turn-off': 'errorTurnOff',
}

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

export function usePushSubscription() {
  // Starts at 'checking', not 'idle', so the opt-in prompts don't flash up
  // for a user who is already subscribed while the check below runs.
  const [status, setStatus] = useState<PushStatus>('checking')
  const [error, setError] = useState<PushErrorCode | null>(null)
  // 'denied' means the browser will never show the prompt again — the user
  // has to change it in browser settings, so nudging them is pointless.
  const [permission, setPermission] = useState<NotificationPermission | null>(null)

  useEffect(() => {
    let cancelled = false

    async function checkState() {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        setStatus('unsupported')
        return
      }

      const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true
      if (isIos && !isStandalone) {
        setStatus('ios-needs-home-screen')
        return
      }

      setPermission(Notification.permission)
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

  /** Must be called from a click handler. Resolves true once subscribed. */
  const subscribe = useCallback(async (): Promise<boolean> => {
    setError(null)
    setStatus('subscribing')
    try {
      const result = await Notification.requestPermission()
      setPermission(result)
      if (result !== 'granted') {
        setStatus('idle')
        setError('permission')
        return false
      }

      const registration = await navigator.serviceWorker.ready
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidKey) {
        setStatus('error')
        setError('not-configured')
        return false
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
      return true
    } catch (err) {
      setStatus('error')
      console.error(err)
      setError('turn-on')
      return false
    }
  }, [])

  const unsubscribe = useCallback(async () => {
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
      setError('turn-off')
    }
  }, [])

  return { status, error, permission, subscribe, unsubscribe }
}

// ─── Opt-in prompt snooze ─────────────────────────────────────────────────────
//
// Per device, in localStorage, because push subscriptions are per device too:
// saying "not now" on a phone shouldn't hide the prompt on a laptop that has
// never been asked. Shared by the onboarding step and the dashboard banner so
// a "Not now" during onboarding doesn't get followed by the banner seconds
// later on the dashboard.

const SNOOZE_KEY = 'push_optin_snoozed_at'
const SNOOZE_DAYS = 30

export function isPushPromptSnoozed(now: number = Date.now()): boolean {
  try {
    const raw = localStorage.getItem(SNOOZE_KEY)
    if (!raw) return false
    const at = Number(raw)
    if (!Number.isFinite(at)) return false
    return now - at < SNOOZE_DAYS * 24 * 60 * 60 * 1000
  } catch {
    // Storage blocked (private mode etc.) — show the prompt; worst case it
    // comes back next visit.
    return false
  }
}

export function snoozePushPrompt(now: number = Date.now()): void {
  try {
    localStorage.setItem(SNOOZE_KEY, String(now))
  } catch {}
}
