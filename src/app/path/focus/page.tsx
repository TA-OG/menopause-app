'use client'

/**
 * Finishing the questions (Care Journey, "Three example moments"): Mel says
 * what she heard, suggests one focus, and she accepts it or chooses another.
 * Also where she comes to change her focus later.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FOCUS_AREAS, focusArea, heardPhrases, type FocusAreaId } from '@/lib/journey'
import { FINISHING, fill } from '@/lib/journey-copy'
import type { JourneyState } from '@/lib/journey-api'
import { Choice, ErrorNote, MelSays, localCalendarDate } from '@/components/journey/Mel'
import { getJSON, postJSON } from '@/components/journey/client'

type Screen = 'loading' | 'heard' | 'suggest' | 'choose' | 'first_week'

export default function FocusPage() {
  const router = useRouter()
  const [state, setState] = useState<JourneyState | null>(null)
  const [screen, setScreen] = useState<Screen>('loading')
  const [chosen, setChosen] = useState<FocusAreaId | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getJSON<JourneyState>(`/api/journey?today=${localCalendarDate()}`)
      .then((s) => {
        if (s.nextSession) return router.replace('/path/about-you')
        setState(s)
        setChosen(s.suggested)
        setScreen(s.journey ? 'choose' : 'heard')
      })
      .catch((err) => setError((err as Error).message))
  }, [router])

  async function start(area: FocusAreaId) {
    setSaving(true)
    setError('')
    const res = await postJSON('/api/journey', { focus_area: area, today: localCalendarDate() })
    setSaving(false)
    if (!res.ok) return setError(res.error)
    if (state?.journey) return router.push('/path')
    setScreen('first_week')
  }

  if (screen === 'loading' || !state) return <ErrorNote message={error} />

  const name = state.name
  const offered = FOCUS_AREAS.filter((a) => state.offered.includes(a.id))

  if (offered.length === 0) {
    return (
      <div className="space-y-4">
        <MelSays>{fill(FINISHING.thankYou.text, { name })}</MelSays>
        <p className="text-sm text-gray-600">
          None of the things you told us about matches a focus yet. You can still see everything we suggest for you in
          your plan.
        </p>
        <Choice primary label="See my plan" onClick={() => router.push('/my-plan')} />
      </div>
    )
  }

  if (screen === 'heard') {
    const heard = heardPhrases(new Map(Object.entries(state.reflected)))
    return (
      <div className="space-y-5">
        <MelSays>
          <p>{fill(FINISHING.thankYou.text, { name })}</p>
          {heard.length > 0 && <p className="mt-3">{heard.map((h) => h.text).join(' ')}</p>}
          <p className="mt-3">{FINISHING.hardSeason.text}</p>
        </MelSays>
        <Choice primary label={FINISHING.thankYouButton.text} onClick={() => setScreen('suggest')} />
      </div>
    )
  }

  if (screen === 'suggest' && chosen) {
    const area = focusArea(chosen)!
    return (
      <div className="space-y-5">
        <MelSays>{fill(FINISHING.suggestFocus.text, { focus: area.label })}</MelSays>
        <Choice primary label={FINISHING.acceptFocus.text} onClick={() => start(area.id)} disabled={saving} />
        <Choice label={FINISHING.chooseOtherFocus.text} onClick={() => setScreen('choose')} />
        <ErrorNote message={error} />
      </div>
    )
  }

  if (screen === 'first_week') {
    return (
      <div className="space-y-5">
        <MelSays>{FINISHING.firstWeek.text}</MelSays>
        <Choice primary label={FINISHING.seeFirstSteps.text} onClick={() => router.push('/path')} />
      </div>
    )
  }

  // 'choose', or 'suggest' with nothing to suggest
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold leading-tight text-brand-900">What would you like to start with?</h2>
      <div className="space-y-2">
        {offered.map((a) => (
          <Choice
            key={a.id}
            label={state.journey?.focus_area === a.id ? `${a.label} (your focus now)` : a.label}
            onClick={() => start(a.id)}
            disabled={saving}
          />
        ))}
      </div>
      <ErrorNote message={error} />
    </div>
  )
}
