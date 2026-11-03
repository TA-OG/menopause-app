'use client'

/**
 * Her questions, in seven short sessions with Mel between them
 * (src/lib/journey-intake.ts).
 *
 * Every answer is saved the moment she gives it (PUT /api/onboarding/answers),
 * so "I'll come back later" picks up exactly where she stopped, and nothing
 * she already told us is ever wiped.
 *
 *   /path/about-you                       the next session she hasn't finished
 *   /path/about-you?session=safe&return=… ask one session again, e.g. the
 *                                         safety questions before Foundations
 */

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { AnswerMap, Choice as ChoiceT } from '@/lib/onboarding-config'
import {
  SESSIONS,
  firstUnansweredStep,
  nextSession,
  type IntakeSession,
  type SessionId,
} from '@/lib/journey-intake'
import { BETWEEN_SESSIONS, SAFETY_SIGNPOST, fill } from '@/lib/journey-copy'
import { saidStruggling } from '@/lib/journey'
import {
  ContinentStep,
  HeritageStep,
  LocationStep,
  MultiStep,
  OptionButton,
  StepHeader,
} from '@/components/intake/IntakeSteps'
import { Choice, ErrorNote, MelSays } from '@/components/journey/Mel'
import { getJSON, saveAnswer } from '@/components/journey/client'

type Phase =
  | { kind: 'loading' }
  | { kind: 'asking'; session: IntakeSession; step: number }
  | { kind: 'after'; session: IntakeSession }
  | { kind: 'heritage'; step: 'intro' | 'continent' | 'heritage' | 'location' }
  | { kind: 'finishing' }

const HERITAGE_KEYS = ['continent', 'heritage', 'city', 'country', 'timezone'] as const

/** Only ever return somewhere on the path, never to an outside address. */
function safeReturn(value: string | null): string | null {
  return value && value.startsWith('/path') && !value.startsWith('//') ? value : null
}

function multiKeys(): Set<string> {
  const keys = new Set<string>(['heritage'])
  for (const s of SESSIONS) for (const st of s.steps) if (st.kind === 'multi') keys.add(st.key)
  return keys
}

export default function AboutYouPage() {
  return (
    <Suspense fallback={null}>
      <AboutYou />
    </Suspense>
  )
}

function AboutYou() {
  const router = useRouter()
  const params = useSearchParams()
  const redo = params.get('session') as SessionId | null
  const returnTo = safeReturn(params.get('return'))

  const [answers, setAnswers] = useState<AnswerMap>({})
  const [answered, setAnswered] = useState<Set<string>>(new Set())
  const [onboarded, setOnboarded] = useState(false)
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const multis = useMemo(multiKeys, [])
  const name = (answers.full_name as string | undefined)?.split(' ')[0] ?? null

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const rows = await getJSON<{ question_key: string; answer_value: string }[]>('/api/onboarding')
        const map: AnswerMap = {}
        for (const r of rows) {
          if (multis.has(r.question_key)) {
            map[r.question_key] = [...((map[r.question_key] as string[] | undefined) ?? []), r.answer_value]
          } else {
            map[r.question_key] = r.answer_value
          }
        }
        const keys = new Set(rows.map((r) => r.question_key))
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        const { data: profile } = user
          ? await supabase.from('profiles').select('onboarding_complete').eq('id', user.id).maybeSingle()
          : { data: null }
        if (cancelled) return
        setAnswers(map)
        setAnswered(keys)
        setOnboarded(!!profile?.onboarding_complete)

        const redoSession = redo ? SESSIONS.find((s) => s.id === redo && s.steps.length > 0) : undefined
        if (redoSession) return setPhase({ kind: 'asking', session: redoSession, step: 0 })
        const next = nextSession(keys)
        if (next) {
          const session = SESSIONS.find((s) => s.id === next)!
          return setPhase({ kind: 'asking', session, step: firstUnansweredStep(session, keys) })
        }
        if (profile?.onboarding_complete) return router.replace(returnTo ?? '/path')
        setPhase({ kind: 'heritage', step: 'intro' })
      } catch (err) {
        if (!cancelled) setError((err as Error).message)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [multis, redo, returnTo, router])

  async function answer(key: string, values: string[]) {
    setSaving(true)
    setError('')
    try {
      await saveAnswer(key, values)
      setAnswers((a) => ({ ...a, [key]: multis.has(key) ? values : values[0] }))
      setAnswered((s) => new Set(s).add(key))
      advance()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  function advance() {
    if (phase.kind !== 'asking') return
    const { session, step } = phase
    if (step + 1 < session.steps.length) return setPhase({ kind: 'asking', session, step: step + 1 })
    if (redo) return finishRedo()
    if (session.after) return setPhase({ kind: 'after', session })
    goToNextSession(session)
  }

  /**
   * Move on from a finished session. Works from the keys just answered rather
   * than `answered`, which may not have re-rendered yet after the last save.
   */
  function goToNextSession(finished: IntakeSession) {
    const keys = new Set(answered)
    for (const st of finished.steps) keys.add(st.key)
    const nextId = nextSession(keys)
    if (nextId) {
      const session = SESSIONS.find((s) => s.id === nextId)!
      return setPhase({ kind: 'asking', session, step: firstUnansweredStep(session, keys) })
    }
    // Already has a plan: rebuild it from her answers as they are now, since
    // the sessions may have changed her safety answers.
    if (onboarded) return finishRedo()
    setPhase({ kind: 'heritage', step: 'intro' })
  }

  async function finishRedo() {
    // A changed safety answer can change which frameworks apply, so the plan
    // is rebuilt from her answers as they are now.
    setPhase({ kind: 'finishing' })
    try {
      if (onboarded) await rebuildPlan()
      router.push(returnTo ?? '/path')
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function finishIntake() {
    setPhase({ kind: 'finishing' })
    setError('')
    try {
      for (const key of HERITAGE_KEYS) {
        const v = answers[key]
        await saveAnswer(key, Array.isArray(v) ? v : v ? [String(v)] : [])
      }
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Please sign in again.')
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ onboarding_complete: true })
        .eq('id', user.id)
      if (profileError) throw profileError
      await rebuildPlan()
      router.push(returnTo ?? '/path/focus')
    } catch (err) {
      setError((err as Error).message ?? 'Something went wrong. Please try again.')
    }
  }

  async function rebuildPlan() {
    const res = await fetch('/api/wellness-plan', { method: 'POST' })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error ?? "Your answers were saved, but we couldn't build your plan. Please try again.")
    }
  }

  function toggleMulti(key: string, value: string, choices?: ChoiceT[]) {
    setAnswers((a) => {
      const current = (a[key] as string[] | undefined) ?? []
      if (current.includes(value)) return { ...a, [key]: current.filter((v) => v !== value) }
      const exclusive = choices?.find((c) => c.value === value)?.exclusive
      if (exclusive) return { ...a, [key]: [value] }
      const exclusiveValues = (choices ?? []).filter((c) => c.exclusive).map((c) => c.value)
      return { ...a, [key]: [...current.filter((v) => !exclusiveValues.includes(v)), value] }
    })
  }

  if (phase.kind === 'loading') return error ? <ErrorNote message={error} /> : null

  if (phase.kind === 'finishing') {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-gray-500">{error ? '' : 'Just a moment…'}</p>
        <ErrorNote message={error} />
        {error && <Choice primary label="Try again" onClick={redo ? finishRedo : finishIntake} />}
      </div>
    )
  }

  if (phase.kind === 'after') {
    const struggling =
      phase.session.id === 'feeling' && saidStruggling(answers.how_are_you as string | undefined)
    return (
      <div className="space-y-5">
        <MelSays>{fill(phase.session.after!.text, { name })}</MelSays>
        {struggling && (
          <div className="rounded-2xl border border-blush-200 bg-blush-50 p-4 text-sm leading-relaxed text-brand-900">
            {SAFETY_SIGNPOST.text}
          </div>
        )}
        <Choice primary label={BETWEEN_SESSIONS.carryOn.text} onClick={() => goToNextSession(phase.session)} />
        <Choice
          label={BETWEEN_SESSIONS.comeBackLater.text}
          onClick={() => router.push(onboarded ? '/dashboard' : '/path?paused=1')}
        />
      </div>
    )
  }

  if (phase.kind === 'heritage') {
    const next = (step: 'continent' | 'heritage' | 'location') => () => setPhase({ kind: 'heritage', step })
    return (
      <div className="space-y-5">
        {phase.step === 'intro' && (
          <>
            <MelSays>{BETWEEN_SESSIONS.heritageIntro.text}</MelSays>
            <Choice primary label={BETWEEN_SESSIONS.carryOn.text} onClick={next('continent')} />
            <Choice label="Skip" onClick={finishIntake} />
          </>
        )}
        {phase.step === 'continent' && <ContinentStep answers={answers} setAnswers={setAnswers} next={next('heritage')} />}
        {phase.step === 'heritage' && <HeritageStep answers={answers} toggleMulti={toggleMulti} next={next('location')} />}
        {phase.step === 'location' && <LocationStep answers={answers} setAnswers={setAnswers} next={finishIntake} />}
        <ErrorNote message={error} />
      </div>
    )
  }

  const { session, step } = phase
  const current = session.steps[step]
  const title = fill(current.title, { name })
  const position = `${step + 1} of ${session.steps.length}`

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>{session.title}</span>
        <span>{position}</span>
      </div>

      {current.kind === 'single' && (
        <div className="space-y-4">
          <StepHeader title={title} subtitle={current.subtitle} />
          <div className="space-y-2">
            {(current.choicesFrom ? current.choicesFrom(answers) : current.choices ?? []).map((c) => (
              <OptionButton
                key={c.value}
                label={c.label}
                selected={answers[current.key] === c.value}
                disabled={saving}
                onClick={() => answer(current.key, [c.value])}
              />
            ))}
          </div>
        </div>
      )}

      {current.kind === 'multi' && (
        <MultiStep
          step={{ ...current, title }}
          answers={answers}
          toggleMulti={toggleMulti}
          next={() => answer(current.key, (answers[current.key] as string[] | undefined) ?? [])}
        />
      )}

      <ErrorNote message={error} />
    </div>
  )
}
