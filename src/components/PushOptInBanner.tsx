'use client'

import { useEffect, useState } from 'react'
import { usePushSubscription, isPushPromptSnoozed, snoozePushPrompt } from '@/lib/use-push-subscription'

/**
 * Dashboard prompt to turn on reminders, for anyone not subscribed on this
 * device — mainly existing users who onboarded before the reminders step
 * existed, plus anyone who chose "Not now" more than 30 days ago.
 *
 * Hidden when there's nothing useful to offer: already subscribed, push
 * unsupported, or permission already denied (the browser won't ask again, so
 * a button would do nothing). "Not now" snoozes it on this device.
 */
export default function PushOptInBanner() {
  const { status, error, permission, subscribe } = usePushSubscription()
  // Read after mount: localStorage doesn't exist during server render.
  const [snoozed, setSnoozed] = useState(true)
  const [justEnabled, setJustEnabled] = useState(false)

  useEffect(() => {
    setSnoozed(isPushPromptSnoozed())
  }, [])

  function notNow() {
    snoozePushPrompt()
    setSnoozed(true)
  }

  async function turnOn() {
    if (await subscribe()) setJustEnabled(true)
  }

  if (justEnabled) {
    return (
      <div role="status" className="bg-white border border-gray-200 rounded-2xl p-4 text-sm text-gray-700">
        Reminders are on. You can change the time or turn them off in your profile.
      </div>
    )
  }

  if (snoozed) return null

  if (status === 'ios-needs-home-screen') {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-4 flex items-start gap-3">
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-900">Want daily reminders?</p>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">
            On iPhone or iPad, add Aunty Mel to your Home Screen first (Share → Add to Home Screen),
            then open it from there and turn reminders on in your profile.
          </p>
        </div>
        <button type="button" onClick={notNow} className="text-xs text-gray-500 font-medium px-2 py-1">
          Not now
        </button>
      </div>
    )
  }

  const canOffer = (status === 'idle' || status === 'subscribing' || status === 'error') && permission !== 'denied'
  if (!canOffer) return null

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4">
      <p className="text-sm font-semibold text-gray-900">Would you like a gentle daily nudge?</p>
      <p className="text-xs text-gray-500 mt-1 leading-relaxed">
        A short reminder each morning to check in on how you&apos;re feeling.
      </p>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      <div className="flex items-center gap-2 mt-3">
        <button
          type="button"
          onClick={turnOn}
          disabled={status === 'subscribing'}
          className="text-xs font-medium px-3 py-2 rounded-lg bg-brand-900 text-white hover:bg-brand-800 disabled:opacity-50"
        >
          {status === 'subscribing' ? 'Turning on…' : 'Turn on reminders'}
        </button>
        <button type="button" onClick={notNow} className="text-xs font-medium px-3 py-2 text-gray-500">
          Not now
        </button>
      </div>
    </div>
  )
}
