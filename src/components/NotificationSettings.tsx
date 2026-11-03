'use client'

import { useState } from 'react'
import { usePushSubscription } from '@/lib/use-push-subscription'

interface Props {
  initialEnabled: boolean
  initialHour: number | null
}

/**
 * Push notification toggle on /profile.
 *
 * Subscribe/unsubscribe and support detection live in usePushSubscription,
 * shared with the onboarding reminders step and the dashboard opt-in banner.
 */
export default function NotificationSettings({ initialEnabled, initialHour }: Props) {
  const { status, error: pushError, subscribe, unsubscribe } = usePushSubscription()
  const [hourError, setHourError] = useState<string | null>(null)
  const error = hourError ?? pushError
  const [hour, setHour] = useState<number>(initialHour ?? 9)
  const [lastSavedHour, setLastSavedHour] = useState<number>(initialHour ?? 9)
  const [hourSaved, setHourSaved] = useState(true)

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
    setHourError(null)
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
      setHourError('Could not save your reminder time — please try again.')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-medium text-gray-900 text-sm">Push notifications</p>
          <p className="text-xs text-gray-500 mt-0.5">
            A daily tip from your plan, and an evening check-in prompt
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setHourError(null)
            void (isSubscribed ? unsubscribe() : subscribe())
          }}
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
          Off on this device — turn on to get reminders from your plan.
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
