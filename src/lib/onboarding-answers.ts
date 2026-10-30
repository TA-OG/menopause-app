/**
 * Saving ONE intake question at a time.
 *
 * The original wizard saves everything at the end, deleting all her answers
 * and inserting the new set. The journey asks in short sessions she can leave
 * and come back to ("I'll come back later"), and the safety gate asks two
 * questions again on their own. Both need to replace one question's answer
 * without touching the rest. That is what this validates; the route
 * (/api/onboarding/answers) writes it.
 *
 * Pure, no I/O. Nothing from the client is trusted: the key must be a
 * question we ask, and for choice questions every value must be one of its
 * choices, with the step's own rules (minimum, "None of these" alone).
 */

import {
  PREFERENCE_KEYS,
  PROFILE_KEYS,
  STEPS,
  type Choice,
  type OnboardingStep,
} from './onboarding-config'

/**
 * Keys written by the bespoke steps (continent, heritage, location) rather
 * than a `key` on a step. Heritage and country are special-category data
 * (UK GDPR, see /privacy); they are optional and always clearable.
 */
const CUSTOM_STEP_KEYS = {
  continent: 'single',
  heritage: 'multi',
  city: 'single',
  country: 'single',
  timezone: 'single',
} as const

const MAX_VALUE_LENGTH = 500
const MAX_VALUES = 30

export type AnswerUpdate =
  | {
      ok: true
      key: string
      /** The values to store, one row each. Empty = she has no answer for it now. */
      values: string[]
      /** Also copied to this profiles column. */
      profileKey: (typeof PROFILE_KEYS)[number] | null
      /** Also copied to this user_preferences column. */
      preferenceKey: (typeof PREFERENCE_KEYS)[number] | null
    }
  | { ok: false; error: string }

type KeyedStep = Extract<OnboardingStep, { key: string }>

function stepFor(key: string): KeyedStep | undefined {
  return STEPS.find((s): s is KeyedStep => 'key' in s && s.key === key)
}

const refuse = (error: string): AnswerUpdate => ({ ok: false, error })

export function validateAnswerUpdate(key: string, rawValues: string[]): AnswerUpdate {
  const values = Array.from(new Set(rawValues.map((v) => v.trim()).filter(Boolean)))
  if (values.length > MAX_VALUES) return refuse('Too many answers')
  if (values.some((v) => v.length > MAX_VALUE_LENGTH)) return refuse('Answer too long')

  const ok = (): AnswerUpdate => ({
    ok: true,
    key,
    values,
    profileKey: (PROFILE_KEYS as readonly string[]).includes(key)
      ? (key as (typeof PROFILE_KEYS)[number])
      : null,
    preferenceKey: (PREFERENCE_KEYS as readonly string[]).includes(key)
      ? (key as (typeof PREFERENCE_KEYS)[number])
      : null,
  })

  // Own keys only: `in` would also accept "__proto__", "constructor", …
  if (Object.prototype.hasOwnProperty.call(CUSTOM_STEP_KEYS, key)) {
    const kind = CUSTOM_STEP_KEYS[key as keyof typeof CUSTOM_STEP_KEYS]
    if (kind === 'single' && values.length > 1) return refuse('One answer only')
    return ok()
  }

  const step = stepFor(key)
  if (!step) return refuse('Not a question we ask')

  switch (step.kind) {
    case 'text':
      if (values.length > 1) return refuse('One answer only')
      if (step.required && values.length === 0) return refuse('This question needs an answer')
      return ok()

    case 'single': {
      if (values.length > 1) return refuse('One answer only')
      if (values.length === 0) {
        return step.skippable ? ok() : refuse('This question needs an answer')
      }
      // Choices derived from earlier answers (e.g. "which bothers you most",
      // from her symptoms) cannot be checked without them; the engine only
      // matches known values, so an unknown one simply matches nothing.
      if (step.choicesFrom) return ok()
      return isChoice(step.choices ?? [], values[0]) ? ok() : refuse('Not one of the options')
    }

    case 'multi': {
      if (values.some((v) => !isChoice(step.choices, v))) return refuse('Not one of the options')
      if (values.length < (step.minSelect ?? 0)) return refuse('This question needs an answer')
      const exclusive = step.choices.filter((c) => c.exclusive).map((c) => c.value)
      if (values.some((v) => exclusive.includes(v)) && values.length > 1) {
        return refuse('"None of these" cannot be chosen with anything else')
      }
      return ok()
    }
  }
}

function isChoice(choices: Choice[], value: string): boolean {
  return choices.some((c) => c.value === value)
}
