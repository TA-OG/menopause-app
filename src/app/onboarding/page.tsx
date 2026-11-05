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

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useMessages, useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import Logo from '@/components/ui/Logo'
import { usePushSubscription, snoozePushPrompt, PUSH_ERROR_MESSAGE_KEY } from '@/lib/use-push-subscription'
import { SUPPORTED_LOCALES, LOCALE_LABELS } from '@/lib/locale-geo-map'
import { setLocale } from '@/lib/set-locale'
import {
  onboardingMessages,
  localizeChoices,
  localizeStep,
  choiceSection,
  messageKey,
  text,
} from '@/lib/onboarding-i18n'
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
  noTranslate = false,
}: {
  label: string
  selected: boolean
  onClick: () => void
  disabled?: boolean
  /** Stop browser auto-translate rewriting the label (native language names). */
  noTranslate?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      translate={noTranslate ? 'no' : undefined}
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
  const t = useTranslations('Onboarding')
  const om = onboardingMessages(useMessages())
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

  const step: OnboardingStep = localizeStep(om, STEPS[stepIndex])
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
        // The API's error text is English; log it, show the user a message
        // in the language they chose.
        const body = await planRes.json().catch(() => ({}))
        console.error('wellness-plan failed:', planRes.status, body.error)
        setError(t('complete.planError'))
        setSaving(false)
        return
      }

      try {
        sessionStorage.removeItem(SS_ANSWERS)
        sessionStorage.removeItem(SS_STEP)
      } catch {}

      router.push('/dashboard')
    } catch (err) {
      // Raw Supabase/network messages are English and technical; log them,
      // show the user a message in their own language.
      console.error('onboarding save failed:', err)
      setError(t('complete.genericError'))
      setSaving(false)
    }
  }

  const showProgress = !(
    step.kind === 'custom' &&
    (step.component === 'language' || step.component === 'disclaimer' || step.component === 'complete')
  )

  return (
    <div className="min-h-screen bg-cream">
      <div className="max-w-lg mx-auto px-6 py-8">
        {showProgress && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <button onClick={back} className="text-sm text-gray-400 hover:text-gray-600 font-medium">
                {t('ui.back')}
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
              label={t('ui.continue')}
              onClick={next}
              disabled={step.required ? !((answers[step.key] as string) ?? '').trim() : false}
            />
          </div>
        )}

        {step.kind === 'single' && (
          <div className="space-y-4">
            <StepHeader title={step.title} subtitle={step.subtitle} />
            <div className="space-y-2">
              {localizeChoices(
                om,
                choiceSection(step),
                step.choicesFrom ? step.choicesFrom(answers) : step.choices ?? []
              ).map((choice) => (
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
                {t('ui.skip')}
              </button>
            )}
          </div>
        )}

        {step.kind === 'multi' && (
          <MultiStep step={step} answers={answers} toggleMulti={toggleMulti} next={next} />
        )}

        {step.kind === 'custom' && step.component === 'language' && (
          <LanguageStep answers={answers} setAnswers={setAnswers} next={next} />
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
        {step.kind === 'custom' && step.component === 'reminders' && (
          <RemindersStep next={next} />
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
  const t = useTranslations('Onboarding')
  const om = onboardingMessages(useMessages())
  const choices = localizeChoices(om, choiceSection(step), step.choices)
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
        {choices.map((choice) => {
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
      <PrimaryButton label={step.ctaLabel ?? t('ui.continue')} onClick={next} disabled={!meetsMin} />
      {step.skippable && (
        <button type="button" onClick={next} className="w-full text-sm text-gray-400 py-1">
          {t('ui.skip')}
        </button>
      )}
    </div>
  )
}

// ─── Bespoke steps ────────────────────────────────────────────────────────────

function LanguageStep({
  answers,
  setAnswers,
  next,
}: {
  answers: AnswerMap
  setAnswers: React.Dispatch<React.SetStateAction<AnswerMap>>
  next: () => void
}) {
  const t = useTranslations('Onboarding.language')
  // Pre-select whatever is already active (geo guess or an earlier choice),
  // so most people just confirm with one tap.
  const activeLocale = useLocale()
  const router = useRouter()
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const [refreshing, startTransition] = useTransition()
  const [advanceWhenReady, setAdvanceWhenReady] = useState(false)

  // Advance only once the refresh has landed, so the next step (the safety
  // disclaimer) is rendered in the chosen language from its first paint
  // rather than flashing the old language first.
  useEffect(() => {
    if (advanceWhenReady && !refreshing) {
      setAdvanceWhenReady(false)
      next()
    }
  }, [advanceWhenReady, refreshing, next])

  async function choose(locale: string) {
    setSaving(locale)
    setError(false)
    try {
      // Cookie first: the whole app (not just this quiz) switches language.
      // Wizard state survives the refresh via the sessionStorage mirror.
      await setLocale(locale)
      setAnswers((a) => ({ ...a, locale }))
      setAdvanceWhenReady(true)
      startTransition(() => router.refresh())
    } catch (err) {
      console.error(err)
      setError(true)
    } finally {
      setSaving(null)
    }
  }

  const selected = (answers.locale as string | undefined) ?? activeLocale
  const busy = saving !== null || refreshing || advanceWhenReady

  return (
    <div className="space-y-6">
      <div className="flex justify-center">
        <Logo size="lg" />
      </div>
      <StepHeader title={t('title')} subtitle={t('subtitle')} />
      <div className="space-y-2">
        {SUPPORTED_LOCALES.map((locale) => (
          <OptionButton
            key={locale}
            // Native names, never translated: someone who can't read the
            // current language must still be able to find their own.
            label={LOCALE_LABELS[locale]}
            selected={selected === locale}
            disabled={busy}
            noTranslate
            onClick={() => choose(locale)}
          />
        ))}
      </div>
      {error && (
        <p role="alert" className="text-red-600 text-sm bg-red-50 rounded-xl px-4 py-2">
          {t('error')}
        </p>
      )}
    </div>
  )
}

function DisclaimerStep({ next }: { next: () => void }) {
  const tDisclaimer = useTranslations('Disclaimer')
  const t = useTranslations('Onboarding.disclaimer')
  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="flex justify-center mb-5">
          <Logo size="lg" />
        </div>
        <p className="text-gray-500 mt-2">{t('intro')}</p>
      </div>
      <div className="bg-white rounded-2xl p-5 border border-brand-100">
        <p className="text-sm text-gray-600 leading-relaxed">{tDisclaimer('full')}</p>
      </div>
      <PrimaryButton label={t('cta')} onClick={next} />
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
  const t = useTranslations('Onboarding')
  const om = onboardingMessages(useMessages())
  return (
    <div className="space-y-4">
      <StepHeader title={t('continent.title')} subtitle={t('continent.subtitle')} />
      <div className="grid grid-cols-2 gap-3">
        {localizeChoices(om, ['continents'], CONTINENT_OPTIONS).map((opt) => (
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
        {t('ui.skip')}
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
  const t = useTranslations('Onboarding')
  const om = onboardingMessages(useMessages())
  const heritage = (answers.heritage as string[] | undefined) ?? []
  const continent = answers.continent as string | undefined
  return (
    <div className="space-y-4">
      <StepHeader title={t('heritage.title')} subtitle={t('heritage.subtitle')} />

      <div className="bg-brand-50 rounded-xl p-3 border border-brand-100">
        <p className="text-xs text-brand-700 leading-relaxed">{t('heritage.note')}</p>
      </div>

      <div className="space-y-4 max-h-[28rem] overflow-y-auto pr-1">
        {COMMUNITY_OPTIONS.filter((group) => {
          // Filtering stays on the canonical English group name.
          if (!continent) return true
          const allowed = CONTINENT_TO_GROUPS[continent] ?? []
          return allowed.includes(group.group)
        }).map((group) => (
          <div key={group.group}>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2 sticky top-0 bg-white py-1">
              {text(om, ['communityGroups', messageKey(group.group)], group.group)}
            </p>
            <div className="space-y-1.5">
              {localizeChoices(om, ['communities'], group.options).map((opt) => (
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
          {t('heritage.selectedCount', { count: heritage.length })}
        </div>
      )}

      <PrimaryButton
        label={
          heritage.length > 0
            ? t('heritage.continueWithCount', { count: heritage.length })
            : t('ui.continue')
        }
        onClick={next}
      />
      <button type="button" onClick={next} className="w-full text-sm text-gray-400 py-1">
        {t('ui.skip')}
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
  // Language is no longer asked here: it is the quiz's first step
  // (LanguageStep), and can be changed later from the profile page.
  const t = useTranslations('Onboarding')
  const om = onboardingMessages(useMessages())

  return (
    <div className="space-y-5">
      <StepHeader title={t('location.title')} subtitle={t('location.subtitle')} />

      <div>
        <label className="text-sm font-medium text-gray-700 block mb-1.5">{t('location.city')}</label>
        <input
          type="text"
          value={(answers.city as string) ?? ''}
          onChange={(e) => setAnswers((a) => ({ ...a, city: e.target.value }))}
          placeholder={t('location.cityPlaceholder')}
          className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
        />
      </div>

      <div>
        <label className="text-sm font-medium text-gray-700 block mb-1.5">{t('location.country')}</label>
        <select
          value={(answers.country as string) ?? ''}
          onChange={(e) => setAnswers((a) => ({ ...a, country: e.target.value }))}
          className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 bg-white"
        >
          <option value="">{t('location.countryPlaceholder')}</option>
          {localizeChoices(om, ['countries'], COUNTRY_OPTIONS).map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-sm font-medium text-gray-700 block mb-1.5">{t('location.timezone')}</label>
        <select
          value={(answers.timezone as string) ?? ''}
          onChange={(e) => setAnswers((a) => ({ ...a, timezone: e.target.value }))}
          className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 bg-white"
        >
          <option value="">{t('location.timezonePlaceholder')}</option>
          {TIMEZONE_OPTIONS.map((group) => (
            <optgroup
              key={group.group}
              label={text(om, ['timezoneGroups', messageKey(group.group)], group.group)}
            >
              {localizeChoices(om, ['timezones'], group.options).map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <PrimaryButton label={t('ui.continue')} onClick={next} />
      <button type="button" onClick={next} className="w-full text-sm text-gray-400 py-1">
        {t('ui.skip')}
      </button>
    </div>
  )
}

function RemindersStep({ next }: { next: () => void }) {
  const t = useTranslations('Onboarding')
  const tNotifications = useTranslations('Notifications')
  const { status, error, permission, subscribe } = usePushSubscription()

  function notNow() {
    snoozePushPrompt()
    next()
  }

  async function turnOn() {
    if (await subscribe()) next()
  }

  const header = (
    <StepHeader title={t('reminders.title')} subtitle={t('reminders.subtitle')} />
  )

  if (status === 'checking') return header

  // Nothing this device can do right now — explain, and let her carry on.
  if (status === 'unsupported' || status === 'ios-needs-home-screen' || permission === 'denied') {
    return (
      <div className="space-y-4">
        {header}
        <p className="text-sm text-gray-600 bg-white border border-gray-200 rounded-2xl px-4 py-3 leading-relaxed">
          {status === 'ios-needs-home-screen'
            ? t('reminders.iosHomeScreen')
            : status === 'unsupported'
              ? t('reminders.unsupported')
              : t('reminders.blocked')}
        </p>
        <PrimaryButton label={t('ui.continue')} onClick={next} />
      </div>
    )
  }

  if (status === 'subscribed') {
    return (
      <div className="space-y-4">
        {header}
        <p className="text-sm text-gray-600">{t('reminders.enabled')}</p>
        <PrimaryButton label={t('ui.continue')} onClick={next} />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {header}
      {error && (
        <p className="text-red-600 text-sm bg-red-50 rounded-xl px-4 py-2">
          {tNotifications(PUSH_ERROR_MESSAGE_KEY[error])}
        </p>
      )}
      <PrimaryButton
        label={status === 'subscribing' ? t('reminders.turningOn') : t('reminders.turnOn')}
        onClick={turnOn}
        disabled={status === 'subscribing'}
      />
      <button type="button" onClick={notNow} className="w-full text-sm text-gray-500 py-2">
        {t('reminders.notNow')}
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
  const t = useTranslations('Onboarding.complete')
  const firstName = (answers.full_name as string | undefined)?.trim().split(/\s+/)[0]
  return (
    <div className="space-y-6 text-center">
      <div className="text-6xl">✨</div>
      <div>
        <h2 className="text-2xl font-bold text-brand-900">
          {firstName ? t('title', { name: firstName }) : t('titleNoName')}
        </h2>
        <p className="text-gray-500 mt-2 text-sm leading-relaxed">{t('body')}</p>
      </div>

      {error && <p className="text-red-600 text-sm bg-red-50 rounded-xl px-4 py-2">{error}</p>}

      <PrimaryButton
        label={saving ? t('building') : t('cta')}
        onClick={onComplete}
        disabled={saving}
      />
    </div>
  )
}
