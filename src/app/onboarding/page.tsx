'use client'

/**
 * Onboarding wizard — renders the questionnaire defined in
 * src/lib/onboarding-config.ts. This component owns NO questions of its own:
 * to add or reorder questions, edit the STEPS array in the config.
 *
 * - Linear flow with back/forward navigation and a progress bar.
 * - Answers held in local state (mirrored to sessionStorage so browser-back
 *   doesn't lose progress) until the final step, then persisted to three
 *   Supabase tables: onboarding_answers, profiles, user_preferences.
 * - The Supabase client is created lazily inside completeOnboarding() so
 *   Next.js static prerendering doesn't crash when env vars are absent at build.
 */

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { DISCLAIMER } from '@/lib/disclaimer'
import Logo from '@/components/ui/Logo'
import {
  STEPS,
  PROFILE_KEYS,
  PREFERENCE_KEYS,
  CONTINENT_OPTIONS,
  CONTINENT_TO_GROUPS,
  COMMUNITY_OPTIONS,
  COUNTRY_OPTIONS,
  TIMEZONE_OPTIONS,
  type OnboardingStep,
  type AnswerMap,
  type Choice,
} from '@/lib/onboarding-config'

// sessionStorage keys — persist answers and step across browser-back
const SS_ANSWERS = 'onboarding_answers'
const SS_STEP = 'onboarding_step'

// ─── Reusable UI ──────────────────────────────────────────────────────────────

function OptionButton({
  label,
  selected,
  onClick,
  disabled = false,
}: {
  label: string
  selected: boolean
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full text-left px-4 py-3 rounded-2xl border text-sm font-medium transition-all ${
        selected
          ? 'bg-brand-900 text-white border-brand-900'
          : disabled
            ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
            : 'bg-white text-gray-700 border-gray-200 hover:border-brand-300 hover:bg-brand-50'
      }`}
    >
      {label}
    </button>
  )
}

function PrimaryButton({
  label,
  onClick,
  disabled = false,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full bg-brand-900 text-white font-semibold py-3 rounded-2xl hover:bg-brand-800 transition-colors disabled:opacity-40"
    >
      {label}
    </button>
  )
}

function StepHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-2xl font-bold text-brand-900 leading-tight">{title}</h2>
      {subtitle && <p className="text-gray-500 mt-2 text-sm leading-relaxed">{subtitle}</p>}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter()
  const [stepIndex, setStepIndex] = useState(0)
  const [answers, setAnswers] = useState<AnswerMap>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Restore progress on mount
  useEffect(() => {
    try {
      const savedAnswers = sessionStorage.getItem(SS_ANSWERS)
      if (savedAnswers) setAnswers(JSON.parse(savedAnswers))
      const savedStep = sessionStorage.getItem(SS_STEP)
      if (savedStep) {
        const idx = parseInt(savedStep, 10)
        if (!isNaN(idx) && idx >= 0 && idx < STEPS.length) setStepIndex(idx)
      }
    } catch {}
  }, [])

  useEffect(() => {
    try {
      sessionStorage.setItem(SS_ANSWERS, JSON.stringify(answers))
    } catch {}
  }, [answers])

  useEffect(() => {
    try {
      sessionStorage.setItem(SS_STEP, String(stepIndex))
    } catch {}
  }, [stepIndex])

  const step: OnboardingStep = STEPS[stepIndex]
  const progress = Math.round((stepIndex / (STEPS.length - 1)) * 100)

  function next() {
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1))
  }
  function back() {
    setStepIndex((i) => Math.max(i - 1, 0))
  }

  function setSingle(key: string, value: string) {
    setAnswers((a) => ({ ...a, [key]: value }))
    next()
  }

  function toggleMulti(key: string, value: string, choices: Choice[] = []) {
    setAnswers((a) => {
      const current = (a[key] as string[] | undefined) ?? []
      const isExclusive = choices.find((c) => c.value === value)?.exclusive ?? false
      let updated: string[]
      if (isExclusive) {
        // Selecting an exclusive choice (e.g. "None of these") clears everything else.
        updated = current.includes(value) ? [] : [value]
      } else if (current.includes(value)) {
        updated = current.filter((v) => v !== value)
      } else {
        // Selecting a regular choice clears any exclusive choice already selected.
        const exclusiveValues = choices.filter((c) => c.exclusive).map((c) => c.value)
        updated = [...current.filter((v) => !exclusiveValues.includes(v)), value]
      }
      return { ...a, [key]: updated }
    })
  }

  /**
   * Persist answers to Supabase and redirect to the dashboard.
   * 1. onboarding_answers — one row per answer (arrays expand to many rows).
   * 2. profiles — full_name, menopause_stage, onboarding_complete.
   * 3. user_preferences — lifestyle data read by the wellness engine.
   */
  async function completeOnboarding() {
    setSaving(true)
    setError('')

    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const answerRows = Object.entries(answers)
        .filter(([, v]) => v !== undefined && v !== '')
        .flatMap(([key, value]) => {
          if (Array.isArray(value)) {
            return value.map((v) => ({ user_id: user.id, question_key: key, answer_value: v }))
          }
          return [{ user_id: user.id, question_key: key, answer_value: String(value) }]
        })

      // Delete then insert — array-type questions share a question_key, so upsert
      // on (user_id, question_key) would reject the extra rows.
      const { error: deleteError } = await supabase
        .from('onboarding_answers')
        .delete()
        .eq('user_id', user.id)
      if (deleteError) throw deleteError

      if (answerRows.length > 0) {
        const { error: answersError } = await supabase
          .from('onboarding_answers')
          .insert(answerRows)
        if (answersError) throw answersError
      }

      const profileUpdate: Record<string, unknown> = { onboarding_complete: true }
      for (const key of PROFILE_KEYS) {
        if (answers[key] !== undefined) profileUpdate[key] = answers[key]
      }
      const { error: profileError } = await supabase
        .from('profiles')
        .update(profileUpdate)
        .eq('id', user.id)
      if (profileError) throw profileError

      const prefUpdate: Record<string, unknown> = { user_id: user.id }
      for (const key of PREFERENCE_KEYS) {
        if (answers[key] !== undefined) prefUpdate[key] = answers[key]
      }
      const { error: prefError } = await supabase
        .from('user_preferences')
        .upsert(prefUpdate, { onConflict: 'user_id' })
      if (prefError) throw prefError

      // Answers are saved at this point — only the plan itself is still
      // pending. Check the response: a failure here must NOT be treated as
      // success, or the user is silently dropped on a dashboard with no
      // plan behind it and no idea anything went wrong.
      const planRes = await fetch('/api/wellness-plan', { method: 'POST' })
      if (!planRes.ok) {
        const body = await planRes.json().catch(() => ({}))
        throw new Error(
          body.error ?? 'Your answers were saved, but we couldn\'t build your plan. Please try again.'
        )
      }

      try {
        sessionStorage.removeItem(SS_ANSWERS)
        sessionStorage.removeItem(SS_STEP)
      } catch {}

      router.push('/dashboard')
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? 'Something went wrong. Please try again.'
      setError(msg)
      setSaving(false)
    }
  }

  const showProgress = !(
    step.kind === 'custom' &&
    (step.component === 'disclaimer' || step.component === 'complete')
  )

  return (
    <div className="min-h-screen bg-cream">
      <div className="max-w-lg mx-auto px-6 py-8">
        {showProgress && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <button onClick={back} className="text-sm text-gray-400 hover:text-gray-600 font-medium">
                ← Back
              </button>
              <span className="text-xs text-gray-400">{progress}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5">
              <div
                className="bg-brand-700 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {step.kind === 'text' && (
          <div className="space-y-6">
            <StepHeader title={step.title} subtitle={step.subtitle} />
            <input
              type="text"
              value={(answers[step.key] as string) ?? ''}
              onChange={(e) => setAnswers((a) => ({ ...a, [step.key]: e.target.value }))}
              placeholder={step.placeholder}
              className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
              autoFocus
            />
            <PrimaryButton
              label="Continue"
              onClick={next}
              disabled={step.required ? !((answers[step.key] as string) ?? '').trim() : false}
            />
          </div>
        )}

        {step.kind === 'single' && (
          <div className="space-y-4">
            <StepHeader title={step.title} subtitle={step.subtitle} />
            <div className="space-y-2">
              {(step.choicesFrom ? step.choicesFrom(answers) : step.choices ?? []).map((choice) => (
                <OptionButton
                  key={choice.value}
                  label={choice.label}
                  selected={answers[step.key] === choice.value}
                  onClick={() => setSingle(step.key, choice.value)}
                />
              ))}
            </div>
            {step.skippable && (
              <button type="button" onClick={next} className="w-full text-sm text-gray-400 py-1">
                Skip this question
              </button>
            )}
          </div>
        )}

        {step.kind === 'multi' && (
          <MultiStep step={step} answers={answers} toggleMulti={toggleMulti} next={next} />
        )}

        {step.kind === 'custom' && step.component === 'disclaimer' && (
          <DisclaimerStep next={next} />
        )}
        {step.kind === 'custom' && step.component === 'continent' && (
          <ContinentStep answers={answers} setAnswers={setAnswers} next={next} />
        )}
        {step.kind === 'custom' && step.component === 'heritage' && (
          <HeritageStep answers={answers} toggleMulti={toggleMulti} next={next} />
        )}
        {step.kind === 'custom' && step.component === 'location' && (
          <LocationStep answers={answers} setAnswers={setAnswers} next={next} />
        )}
        {step.kind === 'custom' && step.component === 'complete' && (
          <CompleteStep answers={answers} saving={saving} error={error} onComplete={completeOnboarding} />
        )}
      </div>
    </div>
  )
}

// ─── Multi-select step ────────────────────────────────────────────────────────

function MultiStep({
  step,
  answers,
  toggleMulti,
  next,
}: {
  step: Extract<OnboardingStep, { kind: 'multi' }>
  answers: AnswerMap
  toggleMulti: (key: string, value: string, choices?: Choice[]) => void
  next: () => void
}) {
  const selected = (answers[step.key] as string[] | undefined) ?? []
  const meetsMin = selected.length >= (step.minSelect ?? 0)
  // Once an exclusive choice ("None of these") is selected, every other choice is
  // disabled — and vice versa: picking any regular choice disables the exclusive one.
  const exclusiveSelected = step.choices.some((c) => c.exclusive && selected.includes(c.value))
  const regularSelected = selected.some((v) => !step.choices.find((c) => c.value === v)?.exclusive)
  return (
    <div className="space-y-4">
      <StepHeader title={step.title} subtitle={step.subtitle} />
      <div className="space-y-2">
        {step.choices.map((choice) => {
          const isSelected = selected.includes(choice.value)
          const isDisabled =
            !isSelected && ((choice.exclusive && regularSelected) || (!choice.exclusive && exclusiveSelected))
          return (
            <OptionButton
              key={choice.value}
              label={choice.label}
              selected={isSelected}
              disabled={isDisabled}
              onClick={() => toggleMulti(step.key, choice.value, step.choices)}
            />
          )
        })}
      </div>
      <PrimaryButton label={step.ctaLabel ?? 'Continue'} onClick={next} disabled={!meetsMin} />
      {step.skippable && (
        <button type="button" onClick={next} className="w-full text-sm text-gray-400 py-1">
          Skip this question
        </button>
      )}
    </div>
  )
}

// ─── Bespoke steps ────────────────────────────────────────────────────────────

function DisclaimerStep({ next }: { next: () => void }) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="flex justify-center mb-5">
          <Logo size="lg" />
        </div>
        <p className="text-gray-500 mt-2">Let&apos;s build your personalised wellness plan.</p>
      </div>
      <div className="bg-white rounded-2xl p-5 border border-brand-100">
        <p className="text-sm text-gray-600 leading-relaxed">{DISCLAIMER.full}</p>
      </div>
      <PrimaryButton label="I understand — let's start" onClick={next} />
    </div>
  )
}

function ContinentStep({
  answers,
  setAnswers,
  next,
}: {
  answers: AnswerMap
  setAnswers: React.Dispatch<React.SetStateAction<AnswerMap>>
  next: () => void
}) {
  return (
    <div className="space-y-4">
      <StepHeader
        title="Where is your heritage from?"
        subtitle="Pick the region that best represents your cultural background. We'll then show you more specific options."
      />
      <div className="grid grid-cols-2 gap-3">
        {CONTINENT_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => {
              setAnswers((a) => ({ ...a, continent: opt.value, heritage: [] }))
              next()
            }}
            className={`flex flex-col items-center gap-2 px-3 py-5 rounded-2xl border text-sm font-medium transition-all ${
              answers.continent === opt.value
                ? 'bg-brand-900 text-white border-brand-900'
                : 'bg-white text-gray-700 border-gray-200 hover:border-brand-300 hover:bg-brand-50'
            }`}
          >
            <span className="text-3xl">{opt.emoji}</span>
            <span className="text-center leading-tight">{opt.label}</span>
          </button>
        ))}
      </div>
      <button type="button" onClick={next} className="w-full text-sm text-gray-400 py-1">
        Skip this question
      </button>
    </div>
  )
}

function HeritageStep({
  answers,
  toggleMulti,
  next,
}: {
  answers: AnswerMap
  toggleMulti: (key: string, value: string) => void
  next: () => void
}) {
  const heritage = (answers.heritage as string[] | undefined) ?? []
  const continent = answers.continent as string | undefined
  return (
    <div className="space-y-4">
      <StepHeader
        title="Which communities do you identify with?"
        subtitle="Select all that apply. The more specific you are, the more relevant your plan."
      />

      <div className="bg-brand-50 rounded-xl p-3 border border-brand-100">
        <p className="text-xs text-brand-700 leading-relaxed">
          Research shows menopause affects different communities differently — in timing, symptoms,
          and which foods help most. This stays private and is never shared.
        </p>
      </div>

      <div className="space-y-4 max-h-[28rem] overflow-y-auto pr-1">
        {COMMUNITY_OPTIONS.filter((group) => {
          if (!continent) return true
          const allowed = CONTINENT_TO_GROUPS[continent] ?? []
          return allowed.includes(group.group)
        }).map((group) => (
          <div key={group.group}>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2 sticky top-0 bg-white py-1">
              {group.group}
            </p>
            <div className="space-y-1.5">
              {group.options.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleMulti('heritage', opt.value)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-all ${
                    heritage.includes(opt.value)
                      ? 'bg-brand-900 text-white border-brand-900'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-brand-300 hover:bg-brand-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {heritage.length > 0 && (
        <div className="bg-brand-50 rounded-xl p-2 text-xs text-brand-700">
          ✓ {heritage.length} selected
        </div>
      )}

      <PrimaryButton
        label={
          heritage.length > 0
            ? `Continue with ${heritage.length} selection${heritage.length > 1 ? 's' : ''}`
            : 'Continue'
        }
        onClick={next}
      />
      <button type="button" onClick={next} className="w-full text-sm text-gray-400 py-1">
        Skip this question
      </button>
    </div>
  )
}

function LocationStep({
  answers,
  setAnswers,
  next,
}: {
  answers: AnswerMap
  setAnswers: React.Dispatch<React.SetStateAction<AnswerMap>>
  next: () => void
}) {
  return (
    <div className="space-y-5">
      <StepHeader
        title="Where do you live?"
        subtitle="Your heritage shapes your culture, but your location shapes your day. We use this to contextualise timing and local food availability."
      />

      <div>
        <label className="text-sm font-medium text-gray-700 block mb-1.5">City or town</label>
        <input
          type="text"
          value={(answers.city as string) ?? ''}
          onChange={(e) => setAnswers((a) => ({ ...a, city: e.target.value }))}
          placeholder="e.g. London, Lagos, Toronto"
          className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
        />
      </div>

      <div>
        <label className="text-sm font-medium text-gray-700 block mb-1.5">Country</label>
        <select
          value={(answers.country as string) ?? ''}
          onChange={(e) => setAnswers((a) => ({ ...a, country: e.target.value }))}
          className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 bg-white"
        >
          <option value="">Select your country</option>
          {COUNTRY_OPTIONS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-sm font-medium text-gray-700 block mb-1.5">Your timezone</label>
        <select
          value={(answers.timezone as string) ?? ''}
          onChange={(e) => setAnswers((a) => ({ ...a, timezone: e.target.value }))}
          className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 bg-white"
        >
          <option value="">Select your timezone</option>
          {TIMEZONE_OPTIONS.map((group) => (
            <optgroup key={group.group} label={group.group}>
              {group.options.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <PrimaryButton label="Continue" onClick={next} />
      <button type="button" onClick={next} className="w-full text-sm text-gray-400 py-1">
        Skip this question
      </button>
    </div>
  )
}

function CompleteStep({
  answers,
  saving,
  error,
  onComplete,
}: {
  answers: AnswerMap
  saving: boolean
  error: string
  onComplete: () => void
}) {
  const firstName = (answers.full_name as string | undefined)?.split(' ')[0] ?? 'there'
  return (
    <div className="space-y-6 text-center">
      <div className="text-6xl">✨</div>
      <div>
        <h2 className="text-2xl font-bold text-brand-900">Your plan is almost ready, {firstName}</h2>
        <p className="text-gray-500 mt-2 text-sm leading-relaxed">
          We&apos;re building your personalised wellness plan based on your answers. It takes just a
          moment.
        </p>
      </div>

      {error && <p className="text-red-600 text-sm bg-red-50 rounded-xl px-4 py-2">{error}</p>}

      <PrimaryButton
        label={saving ? 'Building your plan...' : 'See my plan →'}
        onClick={onComplete}
        disabled={saving}
      />
    </div>
  )
}
