'use client'

/**
 * Welcome: she meets Mel before any question (Care Journey, "Welcome").
 * Four screens, one action each, then her name.
 *
 * The full wellness disclaimer that opens the wizard is kept, word for word,
 * one tap away on "Who's behind me", and "I understand" accepts it there.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DISCLAIMER } from '@/lib/disclaimer'
import { WELCOME } from '@/lib/journey-copy'
import { Choice, ErrorNote, MelSays } from '@/components/journey/Mel'
import { saveAnswer } from '@/components/journey/client'

type Screen = 'hello' | 'how' | 'who' | 'name'

export default function WelcomePage() {
  const router = useRouter()
  const [screen, setScreen] = useState<Screen>('hello')
  const [showDisclaimer, setShowDisclaimer] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function saveName() {
    setSaving(true)
    setError('')
    try {
      await saveAnswer('full_name', [name.trim()])
      router.push('/path/about-you')
    } catch (err) {
      setError((err as Error).message)
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {screen === 'hello' && (
        <>
          <MelSays>{WELCOME.hello.text}</MelSays>
          <Choice primary label={WELCOME.helloButton.text} onClick={() => setScreen('how')} />
        </>
      )}

      {screen === 'how' && (
        <>
          <MelSays>{WELCOME.howItWorks.text}</MelSays>
          <Choice primary label={WELCOME.howItWorksButton.text} onClick={() => setScreen('who')} />
        </>
      )}

      {screen === 'who' && (
        <>
          <MelSays>{WELCOME.whoIsBehindMe.text}</MelSays>
          <div className="rounded-2xl border border-gray-100 bg-white p-4">
            <button
              type="button"
              onClick={() => setShowDisclaimer((v) => !v)}
              className="text-sm font-medium text-brand-700 underline"
              aria-expanded={showDisclaimer}
            >
              {showDisclaimer ? 'Hide the full note' : 'Read the full note'}
            </button>
            {showDisclaimer && (
              <p className="mt-3 text-sm leading-relaxed text-gray-600">{DISCLAIMER.full}</p>
            )}
          </div>
          <Choice primary label={WELCOME.whoIsBehindMeButton.text} onClick={() => setScreen('name')} />
        </>
      )}

      {screen === 'name' && (
        <>
          <MelSays>{WELCOME.askName.text}</MelSays>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your first name"
            maxLength={100}
            autoFocus
            className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
          />
          <ErrorNote message={error} />
          <Choice primary label={saving ? 'Saving…' : 'Continue'} onClick={saveName} disabled={!name.trim() || saving} />
        </>
      )}
    </div>
  )
}
