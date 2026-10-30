'use client'

/**
 * Stage 2, Foundations: one food or lifestyle change a week for her focus,
 * on the weekly focus programme (/api/focus, docs/focus-programme.md).
 *
 * Every change is shown with PlanCard, the same card as /my-plan, so its
 * personal notes, cautions and disclaimers appear exactly as they do there.
 * A change no longer in her plan is shown from its snapshot for the record,
 * and never as current advice.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import PlanCard from '@/components/plan/PlanCard'
import type { FocusState, WeekView } from '@/lib/focus-api'
import type { WeeklyChangeCandidate } from '@/lib/focus-programme'
import { MORNING, PATH, fill } from '@/lib/journey-copy'
import { focusArea, programmeSymptoms, type FocusAreaId } from '@/lib/journey'
import { Choice, ErrorNote, localCalendarDate } from './Mel'
import { postJSON } from './client'

type Load =
  | { kind: 'loading' }
  | { kind: 'gate'; gate: 'not_premium' | 'no_plan' | 'geo'; error: string }
  | { kind: 'ready'; state: FocusState }
  | { kind: 'error'; error: string }

const SAFETY_LINK = '/path/about-you?session=safe&return=/path'

export default function Foundations({ focus, name }: { focus: FocusAreaId; name: string | null }) {
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const today = localCalendarDate()

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/focus?today=${today}`, { cache: 'no-store' })
    const body = await res.json().catch(() => ({}))
    if (res.ok) return setLoad({ kind: 'ready', state: body.data as FocusState })
    if (body.gate) return setLoad({ kind: 'gate', gate: body.gate, error: body.error })
    setLoad({ kind: 'error', error: body.error ?? 'Something went wrong loading this.' })
  }, [today])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function act(url: string, payload: unknown) {
    setBusy(true)
    setError('')
    const res = await postJSON(url, payload)
    setBusy(false)
    if (!res.ok) {
      if (res.gate === 'safety') return setError('safety')
      return setError(res.error)
    }
    refresh()
  }

  if (load.kind === 'loading') return null
  if (load.kind === 'error') return <ErrorNote message={load.error} />
  if (load.kind === 'gate') {
    if (load.gate === 'not_premium') {
      return (
        <div className="space-y-3 rounded-2xl border border-brand-100 bg-white p-5">
          <p className="text-sm leading-relaxed text-brand-900">{fill(PATH.freeWeekEnd.text, { name })}</p>
          <Link href="/pay" className="block w-full rounded-2xl bg-brand-900 py-3 text-center font-semibold text-white">
            Join Aunty Mel Premium
          </Link>
        </div>
      )
    }
    return <ErrorNote message={load.error} />
  }

  const { state } = load
  const safetyNeeded = state.gates.safety_required || error === 'safety'
  const safetyPrompt = (
    <div className="space-y-3 rounded-2xl border border-blush-200 bg-blush-50 p-5">
      <p className="text-sm leading-relaxed text-brand-900">{PATH.safetyFirst.text}</p>
      <Link href={SAFETY_LINK} className="block w-full rounded-2xl bg-brand-900 py-3 text-center font-semibold text-white">
        Answer them now
      </Link>
    </div>
  )

  if (state.state === 'none') {
    const area = focusArea(focus)
    const symptoms = area ? programmeSymptoms(area, { symptoms: state.options }) : []
    if (safetyNeeded) return safetyPrompt
    return (
      <div className="space-y-3">
        <Choice
          primary
          label={busy ? 'Starting…' : 'See my first change'}
          disabled={busy || symptoms.length === 0}
          onClick={() => act('/api/focus', { focus_symptoms: symptoms, today })}
        />
        <ErrorNote message={error === 'safety' ? '' : error} />
      </div>
    )
  }

  const current = state.current
  return (
    <div className="space-y-4">
      {current ? (
        <ThisWeek
          view={current}
          canKeep={state.canKeepWithoutRelease}
          kept={state.kept}
          done={state.todayCheckin?.done ?? []}
          busy={busy}
          onCheckin={(id, yes) =>
            act('/api/focus/checkin', { checkin_date: today, done: yes ? [id] : [], not_done: yes ? [] : [id] })
          }
          onReview={(outcome, release = []) =>
            act('/api/focus/review', { today, outcome, release_week_ids: release })
          }
        />
      ) : safetyNeeded ? (
        safetyPrompt
      ) : (
        <NextWeek
          next={state.next}
          busy={busy}
          onStart={(id) => act('/api/focus/week', { today, recommendation_id: id })}
          onRest={() => act('/api/focus/week', { today, rest: true })}
        />
      )}

      {state.kept.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Still with you</p>
          {state.kept.map((k) =>
            k.current ? (
              <KeptChange
                key={k.week.id}
                view={k}
                done={state.todayCheckin?.done ?? []}
                busy={busy}
                onCheckin={(id, yes) =>
                  act('/api/focus/checkin', { checkin_date: today, done: yes ? [id] : [], not_done: yes ? [] : [id] })
                }
              />
            ) : null
          )}
        </div>
      )}
      <ErrorNote message={error === 'safety' ? '' : error} />
    </div>
  )
}

function ChangeCard({ view }: { view: WeekView }) {
  if (view.current) return <PlanCard rec={view.current} />
  const snap = view.week.recommendation_snapshot
  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-600">
      <p className="font-medium">{snap?.title}</p>
      <p className="mt-2 text-xs">
        This change is no longer in your plan, because your answers have changed. It&apos;s here for your record only.
      </p>
    </div>
  )
}

function ThisWeek({
  view,
  canKeep,
  kept,
  done,
  busy,
  onCheckin,
  onReview,
}: {
  view: WeekView
  canKeep: boolean
  kept: WeekView[]
  done: string[]
  busy: boolean
  onCheckin: (id: string, yes: boolean) => void
  onReview: (outcome: 'kept' | 'stopped' | 'rested', release?: string[]) => void
}) {
  const id = view.week.recommendation_id
  const day = (view.dayIndex ?? 0) + 1

  if (view.week.kind === 'rest') {
    return (
      <div className="space-y-3 rounded-2xl border border-brand-100 bg-white p-5">
        <p className="font-semibold text-brand-900">{PATH.restWeek.text}</p>
        <p className="text-sm text-gray-600">{PATH.restWeekBody.text}</p>
        {view.reviewDue && <Choice primary label="I'm ready for the next week" onClick={() => onReview('rested')} disabled={busy} />}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">This week · day {Math.min(day, 7)}</p>
      <ChangeCard view={view} />
      {id && view.current && !view.reviewDue && (
        <CheckinButtons id={id} done={done.includes(id)} busy={busy} onCheckin={onCheckin} />
      )}
      {view.reviewDue && (
        <div className="space-y-2 rounded-2xl border border-brand-100 bg-white p-4">
          <p className="text-sm font-medium text-brand-900">How did this week go?</p>
          {canKeep ? (
            <Choice primary label="Keep it" onClick={() => onReview('kept')} disabled={busy} />
          ) : (
            // Never more than three on her check-in (focus decision 6). She
            // chooses which one goes; nothing is dropped without her.
            <div className="space-y-2">
              <p className="text-xs text-gray-500">
                You&apos;re already keeping as many changes as we ask about each day. To keep this one, choose one to let
                go:
              </p>
              {kept.map((k) => (
                <Choice
                  key={k.week.id}
                  label={`Keep this, let go of "${k.current?.title ?? k.week.recommendation_snapshot?.title ?? 'an earlier change'}"`}
                  onClick={() => onReview('kept', [k.week.id])}
                  disabled={busy}
                />
              ))}
            </div>
          )}
          <Choice label="Try something else" onClick={() => onReview('stopped')} disabled={busy} />
        </div>
      )}
    </div>
  )
}

function KeptChange({
  view,
  done,
  busy,
  onCheckin,
}: {
  view: WeekView
  done: string[]
  busy: boolean
  onCheckin: (id: string, yes: boolean) => void
}) {
  const id = view.week.recommendation_id
  if (!id || !view.current) return null
  return (
    <div className="space-y-2 rounded-2xl border border-gray-100 bg-white p-4">
      <p className="text-sm font-medium text-brand-900">{view.current.title}</p>
      <CheckinButtons id={id} done={done.includes(id)} busy={busy} onCheckin={onCheckin} />
    </div>
  )
}

function CheckinButtons({
  id,
  done,
  busy,
  onCheckin,
}: {
  id: string
  done: boolean
  busy: boolean
  onCheckin: (id: string, yes: boolean) => void
}) {
  if (done) return <p className="text-sm text-brand-700">✓ Done today</p>
  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-600">{MORNING.smallStep.text}</p>
      <div className="grid grid-cols-2 gap-2">
        <Choice label={MORNING.yes.text} onClick={() => onCheckin(id, true)} disabled={busy} />
        <Choice label={PATH.notToday.text} onClick={() => onCheckin(id, false)} disabled={busy} />
      </div>
    </div>
  )
}

function NextWeek({
  next,
  busy,
  onStart,
  onRest,
}: {
  next: { pick: WeeklyChangeCandidate | null; alternatives: WeeklyChangeCandidate[]; closestMatch: boolean } | null
  busy: boolean
  onStart: (id: string) => void
  onRest: () => void
}) {
  if (!next?.pick) {
    return (
      <div className="space-y-3 rounded-2xl border border-brand-100 bg-white p-5">
        <p className="text-sm text-gray-600">
          There are no more changes in your plan for this focus right now. You can rest this week, or choose a different
          focus.
        </p>
        <Choice label={PATH.restWeek.text} onClick={onRest} disabled={busy} />
        <Link href="/path/focus" className="block text-center text-sm text-brand-700 underline">
          Choose a different focus
        </Link>
      </div>
    )
  }
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Your next change</p>
      {next.closestMatch && (
        <p className="text-xs text-gray-500">This is the closest match in your plan for your focus.</p>
      )}
      <PlanCard rec={next.pick.rec} />
      <Choice primary label="Start this change" onClick={() => onStart(next.pick!.rec.id)} disabled={busy} />
      {next.alternatives.map((alt) => (
        <details key={alt.rec.id} className="rounded-2xl border border-gray-100 bg-white p-3">
          <summary className="cursor-pointer text-sm text-gray-700">Or: {alt.rec.title}</summary>
          <div className="mt-3 space-y-2">
            <PlanCard rec={alt.rec} />
            <Choice label="Start this one instead" onClick={() => onStart(alt.rec.id)} disabled={busy} />
          </div>
        </details>
      ))}
      <Choice label={PATH.restWeek.text} onClick={onRest} disabled={busy} />
    </div>
  )
}
