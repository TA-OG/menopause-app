'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { usePushSubscription, PUSH_ERROR_MESSAGE_KEY } from '@/lib/use-push-subscription'

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
  const t = useTranslations('Notifications')
  const locale = useLocale()
  const { status, error: pushError, subscribe, unsubscribe } = usePushSubscription()
  const [hourError, setHourError] = useState<string | null>(null)
  const error = hourError ?? (pushError ? t(PUSH_ERROR_MESSAGE_KEY[pushError]) : null)
  const [hour, setHour] = useState<number>(initialHour ?? 9)
  const [lastSavedHour, setLastSavedHour] = useState<number>(initialHour ?? 9)
  const [hourSaved, setHourSaved] = useState(true)

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
      setHourError(t('errorHour'))
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
          {isBusy ? t('working') : isSubscribed ? t('turnOff') : t('turnOn')}
        </button>
      </div>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      {!initialEnabled && !isSubscribed && status === 'idle' && (
        <p className="text-xs text-gray-400 mt-2">{t('offByDefault')}</p>
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
