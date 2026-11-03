'use client'

/**
 * Her care plan: one path in three stages (Care Journey, "Your care plan").
 * She sees the whole path; only her current stage is open.
 *
 * Routes her to the right place first: the welcome if she hasn't met Mel,
 * her questions if any are left, the focus choice if she hasn't chosen.
 */

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { focusArea, morningReply, MORNING_FEELINGS, type MorningFeeling, type StageId } from '@/lib/journey'
import { MORNING, PATH, SAFETY_SIGNPOST, BETWEEN_SESSIONS, fill } from '@/lib/journey-copy'
import type { JourneyState } from '@/lib/journey-api'
import Foundations from '@/components/journey/Foundations'
import { Choice, ErrorNote, FromPamela, MelSays, localCalendarDate } from '@/components/journey/Mel'
import { getJSON, postJSON } from '@/components/journey/client'

const STAGES: { id: StageId; label: string }[] = [
  { id: 'feel_safe', label: PATH.stageFeelSafe.text },
  { id: 'foundations', label: PATH.stageFoundations.text },
  { id: 'support', label: PATH.stageSupport.text },
]

const FEELING_LABEL: Record<MorningFeeling, string> = {
  good: MORNING.good.text,
  up_and_down: MORNING.upAndDown.text,
  hard: MORNING.hard.text,
}

export default function PathPage() {
  return (
    <Suspense fallback={null}>
      <Path />
    </Suspense>
  )
}

function Path() {
  const router = useRouter()
  const paused = useSearchParams().get('paused') === '1'
  const [state, setState] = useState<JourneyState | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const today = localCalendarDate()

  const load = useCallback(async () => {
    try {
      setState(await getJSON<JourneyState>(`/api/journey?today=${today}`))
    } catch (err) {
      setError((err as Error).message)
    }
  }, [today])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!state || paused) return
    if (!state.name && state.nextSession === 'feeling') router.replace('/path/welcome')
    else if (state.nextSession) router.replace('/path/about-you')
    else if (!state.journey) router.replace('/path/focus')
  }, [state, paused, router])

  async function saveDay(payload: { feeling?: MorningFeeling; invitation_outcome?: 'done' | 'not_today' }) {
    setBusy(true)
    setError('')
    const res = await postJSON('/api/journey/day', { today, ...payload })
    setBusy(false)
    if (!res.ok) return setError(res.error)
    load()
  }

  if (!state) return <ErrorNote message={error} />

  // She chose "I'll come back later" part-way through her questions.
  if (state.nextSession) {
    return (
      <div className="space-y-5">
        <MelSays>{fill(PATH.welcomeBack.text, { name: state.name })}</MelSays>
        <Choice primary label={BETWEEN_SESSIONS.carryOn.text} onClick={() => router.push('/path/about-you')} />
      </div>
    )
  }
  if (!state.journey || !state.position) return null

  const { position, journey } = state
  const area = focusArea(journey.focus_area)
  const feeling = state.today?.feeling ?? null
  const invitationDone =
    state.today?.invitation_id === position.invitation?.id ? state.today?.invitation_outcome : null

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">{PATH.title.text}</p>
        <h1 className="text-2xl font-bold leading-tight text-brand-900">
          {fill('Your care plan, {name}', { name: state.name })}
        </h1>
        {area && (
          <p className="text-sm text-gray-600">
            Your focus: <span className="font-semibold text-brand-900">{area.label}</span>{' '}
            <Link href="/path/focus" className="text-xs text-brand-700 underline">
              change
            </Link>
          </p>
        )}
      </header>

      <ol className="space-y-2" aria-label="Your path">
        {STAGES.map((s) => {
          const here = s.id === position.stage
          return (
            <li
              key={s.id}
              className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm ${
                here ? 'border-brand-300 bg-white' : 'border-gray-100 bg-white/60 text-gray-400'
              }`}
              aria-current={here ? 'step' : undefined}
            >
              <span aria-hidden>{here ? '●' : '○'}</span>
              <span className={here ? 'font-semibold text-brand-900' : ''}>{s.label}</span>
              <span className="ml-auto text-xs">
                {here
                  ? s.id === 'feel_safe'
                    ? `Day ${position.day ?? 1} of 7 · you are here`
                    : 'you are here'
                  : STAGES.findIndex((x) => x.id === s.id) > STAGES.findIndex((x) => x.id === position.stage)
                    ? PATH.waiting.text
                    : ''}
              </span>
            </li>
          )
        })}
      </ol>

      {/* Every morning: her answer changes only Mel's words today, never her focus. */}
      <section className="space-y-3">
        {feeling ? (
          <MelSays>{morningReply(feeling).text}</MelSays>
        ) : (
          <>
            <p className="font-semibold text-brand-900">{MORNING.question.text}</p>
            <div className="grid grid-cols-3 gap-2">
              {MORNING_FEELINGS.map((f) => (
                <Choice key={f} label={FEELING_LABEL[f]} onClick={() => saveDay({ feeling: f })} disabled={busy} />
              ))}
            </div>
          </>
        )}
        {state.showSignpost && (
          <div
            role="note"
            className="rounded-2xl border border-blush-200 bg-blush-50 p-4 text-sm leading-relaxed text-brand-900"
          >
            {SAFETY_SIGNPOST.text}
          </div>
        )}
      </section>

      {position.stage === 'feel_safe' && position.invitation && (
        <section className="space-y-3">
          <MelSays>
            <p>
              <span className="font-semibold">Today, from Mel: </span>
              {position.invitation.says.text}
            </p>
            <p className="mt-3">{position.invitation.invitation.text}</p>
          </MelSays>
          {invitationDone ? (
            <p className="text-center text-sm text-brand-700">{PATH.seeYouTomorrow.text}</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Choice primary label={PATH.didThis.text} onClick={() => saveDay({ invitation_outcome: 'done' })} disabled={busy} />
              <Choice label={PATH.notToday.text} onClick={() => saveDay({ invitation_outcome: 'not_today' })} disabled={busy} />
            </div>
          )}
          {/* Pamela approved "Your story matters" for the start of the path (clip 10). */}
          {position.day === 1 && <FromPamela slug="your-story-matters" />}
        </section>
      )}

      {position.stage !== 'feel_safe' && (
        <section className="space-y-3">
          <h2 className="font-semibold text-brand-900">{PATH.stageFoundations.text}</h2>
          {state.isPremium ? (
            <Foundations focus={journey.focus_area} name={state.name} />
          ) : (
            <div className="space-y-3 rounded-2xl border border-brand-100 bg-white p-5">
              <p className="text-sm leading-relaxed text-brand-900">{fill(PATH.freeWeekEnd.text, { name: state.name })}</p>
              <Link href="/pay" className="block w-full rounded-2xl bg-brand-900 py-3 text-center font-semibold text-white">
                Join Aunty Mel Premium
              </Link>
            </div>
          )}
        </section>
      )}

      <ErrorNote message={error} />

      <p className="text-center text-xs text-gray-400">
        <Link href="/my-plan" className="underline">
          Everything Mel suggests for you
        </Link>
      </p>
    </div>
  )
}
