'use client'

/**
 * Building blocks for asking intake questions, shared by the original wizard
 * (src/app/onboarding/page.tsx) and the journey's short sessions
 * (src/app/path/about-you/page.tsx), so a question looks and behaves the same
 * wherever it is asked. Moved here unchanged from the wizard.
 */

import {
  CONTINENT_OPTIONS,
  CONTINENT_TO_GROUPS,
  COMMUNITY_OPTIONS,
  COUNTRY_OPTIONS,
  TIMEZONE_OPTIONS,
  type OnboardingStep,
  type AnswerMap,
  type Choice,
} from '@/lib/onboarding-config'

export function OptionButton({
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

export function PrimaryButton({
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

export function StepHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-2xl font-bold text-brand-900 leading-tight">{title}</h2>
      {subtitle && <p className="text-gray-500 mt-2 text-sm leading-relaxed">{subtitle}</p>}
    </div>
  )
}

export function MultiStep({
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

export function ContinentStep({
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

export function HeritageStep({
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

export function LocationStep({
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
