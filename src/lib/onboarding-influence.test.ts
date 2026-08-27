/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EVERY QUESTION MUST SHAPE THE PLAN
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `onboarding-config.test.ts` already guards one direction of the contract:
 * every question a framework triggers on must actually be collected, so a
 * framework can't silently never fire.
 *
 * This file guards the other, and more expensive, direction: every question we
 * collect must actually change something. That direction had never been
 * checked, and 11 of the 20 questions had quietly stopped mattering —
 * age_range, symptom_severity, primary_goal, diet_type, diet_restrictions,
 * smoking_status, alcohol_intake, caffeine_intake, sleep_quality,
 * medical_flags, previously_tried. Each was asked, stored, and never read.
 *
 * Asking a woman with brain fog to work through a 20-step intake and then
 * ignoring 11 of her answers is not a cosmetic bug. It is the difference
 * between a bespoke plan and a generic one wearing her name.
 *
 * HOW THIS TESTS IT
 * Not by grepping for the key — a reference proves nothing about influence.
 * Behaviourally: take one realistic user, change exactly ONE answer, run the
 * real pipeline over the real framework YAML, and require the output to differ.
 * If changing an answer changes nothing, the question is decoration.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { matchFrameworks, buildPlan, selectFocus } from './wellness-engine'
import { deriveUserSignals } from './user-signals'
import { loadFrameworks } from './load-frameworks'
import { loadSubstanceRegistry } from './substance-registry'
import {
  collectedKeys,
  PROFILE_KEYS,
  SYMPTOM_CHOICES,
  STEPS,
} from './onboarding-config'
import { MEDICAL_FLAG_PATTERNS, DIET_RESTRICTION_PATTERNS } from './medical-flags'
import type {
  WellnessFramework,
  SubstanceEntry,
  OnboardingAnswer,
} from '@/types/database'

let frameworks: WellnessFramework[]
let substances: SubstanceEntry[]

beforeAll(async () => {
  frameworks = await loadFrameworks()
  substances = loadSubstanceRegistry()
})

/** An answer set, written as a plain spec. Arrays become multiple rows. */
type Spec = Record<string, string | string[]>

function toAnswers(spec: Spec): OnboardingAnswer[] {
  const rows: OnboardingAnswer[] = []
  for (const [key, value] of Object.entries(spec)) {
    for (const v of Array.isArray(value) ? value : [value]) {
      rows.push({
        id: `${key}-${v}`,
        user_id: 'u1',
        question_key: key,
        answer_value: v,
        answered_at: '',
      })
    }
  }
  return rows
}

/**
 * A deliberately broad baseline. Enough frameworks fire that every question has
 * something it could plausibly act on — a narrow user would let a question look
 * inert purely because the relevant content never loaded.
 */
const BASELINE: Spec = {
  age_range: '45–49',
  menopause_stage: 'perimenopause',
  symptoms: [
    'hot_flashes',
    'sleep_problems',
    'anxiety',
    'joint_pain',
    'skin_changes',
    'weight_changes',
  ],
  primary_symptom: 'sleep_problems',
  symptom_severity: 'moderate',
  primary_goal: 'Improve sleep',
  diet_type: 'mixed',
  exercise_level: 'moderately_active',
  smoking_status: 'non_smoker',
  alcohol_intake: 'occasional',
  caffeine_intake: 'low',
  sleep_quality: 'fair',
  stress_level: 'moderate',
}

/**
 * Everything the user actually receives, flattened to a comparable string:
 * which recommendations, in which order, and what personal context each
 * carries. Any real difference in her plan shows up as a difference here.
 */
function renderPlan(spec: Spec): string {
  const answers = toAnswers(spec)
  const signals = deriveUserSignals(answers, {})
  const matched = matchFrameworks(answers, frameworks)
  const plan = buildPlan(matched, {}, signals.primary_symptom, substances, signals)

  const line = (prefix: string, recs: typeof plan.diet_adjustments) =>
    recs
      .map(
        (r, i) =>
          `${prefix}#${i}:${r.id}` +
          (r.personal_note ? `[${r.personal_note.because.join('+')}]` : '')
      )
      .join('\n')

  return [
    line('diet', plan.diet_adjustments),
    line('life', plan.lifestyle_adjustments),
    line('mind', plan.mindset_recommendations),
    line('supp', plan.supplement_suggestions),
    // Focus is cross-category, so signals that move a whole category register
    // here even when they reorder nothing inside it.
    'focus:' + selectFocus(plan, signals, 5).map((r) => r.id).join(','),
  ].join('\n')
}

/**
 * One contrasting answer per question. Both values are real choices from
 * onboarding-config.ts — asserted below, so a renamed choice fails loudly here
 * rather than quietly making a test vacuous.
 */
const CONTRASTS: Record<string, [Spec, Spec]> = {
  menopause_stage: [
    { menopause_stage: 'perimenopause' },
    { menopause_stage: 'postmenopause' },
  ],
  symptoms: [
    { symptoms: ['hot_flashes', 'sleep_problems'], primary_symptom: 'sleep_problems' },
    { symptoms: ['low_libido', 'vaginal_dryness'], primary_symptom: 'low_libido' },
  ],
  primary_symptom: [
    { primary_symptom: 'sleep_problems' },
    { primary_symptom: 'joint_pain' },
  ],
  symptom_severity: [{ symptom_severity: 'mild' }, { symptom_severity: 'severe' }],
  primary_goal: [
    { primary_goal: 'Improve sleep' },
    { primary_goal: 'Manage weight' },
  ],
  diet_type: [{ diet_type: 'whole_foods' }, { diet_type: 'convenience' }],
  diet_restrictions: [
    { diet_restrictions: 'none' },
    { diet_restrictions: 'shellfish_allergy' },
  ],
  exercise_level: [
    { exercise_level: 'very_active' },
    { exercise_level: 'limited' },
  ],
  // Both sides pin menopause_stage, because the ONLY smoking content in the
  // repo (lf_smoking_cessation) lives in bone-cardiovascular.yaml, which fires
  // for menopause/postmenopause/surgical and NOT for perimenopause. So a
  // perimenopausal smoker currently receives no smoking advice of any kind —
  // a content gap, not an engine one, and one this contrast would otherwise
  // hide behind a false negative. The two sides still differ in exactly one key.
  smoking_status: [
    { menopause_stage: 'postmenopause', smoking_status: 'non_smoker' },
    { menopause_stage: 'postmenopause', smoking_status: 'regular_smoker' },
  ],
  alcohol_intake: [{ alcohol_intake: 'none' }, { alcohol_intake: 'frequent' }],
  caffeine_intake: [{ caffeine_intake: 'none' }, { caffeine_intake: 'high' }],
  // Both sides pin a primary_symptom OTHER than sleep. When sleep_problems is
  // already her primary symptom, boostForPrimarySymptom has promoted every
  // sleep-targeting card to 'high' and SCORE_WEIGHTS.PRIMARY_SYMPTOM has lifted
  // them to the top — so SLEEP_NEED lands on cards that are already first and
  // reorders nothing. That masking is correct behaviour; testing under it would
  // simply be measuring the wrong thing. The signal that matters is the woman
  // whose main complaint is her joints but who also sleeps badly.
  sleep_quality: [
    { primary_symptom: 'joint_pain', sleep_quality: 'good' },
    { primary_symptom: 'joint_pain', sleep_quality: 'very_poor' },
  ],
  stress_level: [{ stress_level: 'low' }, { stress_level: 'very_high' }],
  medical_flags: [
    { medical_flags: 'none' },
    { medical_flags: 'blood_thinners' },
  ],
  previously_tried: [
    { previously_tried: 'Nothing yet' },
    { previously_tried: 'Natural supplements' },
  ],
}

/**
 * Questions that legitimately do not shape the wellness plan.
 *
 * This list is asserted to be EXACTLY right, in both directions — a new
 * question that shapes nothing fails the build, and a question that starts
 * mattering must be removed from here. It cannot be quietly grown.
 */
const NOT_PLAN_SHAPING: Record<string, string> = {
  full_name: 'Written to profiles.full_name for the greeting. Never a plan input.',
  continent:
    'Feeds the cultural engine (cultural_context on the plan row), not the ' +
    'recommendation pipeline. Covered by cultural-engine.test.ts.',
  heritage:
    'Feeds the cultural engine. UK GDPR special-category data — see ' +
    'src/app/privacy/page.tsx.',
  country: 'Feeds the cultural engine and the geo/jurisdiction gate.',
}

/**
 * Questions collected but NOT yet influencing the plan, each with the reason
 * and what it would take to fix.
 *
 * Every entry here is a promise to the user that we are not yet keeping, so the
 * list is deliberately uncomfortable to look at and impossible to extend
 * silently. Nothing goes in without a reason a clinician would accept.
 */
const PENDING_CLINICAL_REVIEW: Record<string, string> = {
  age_range:
    'No content declares age relevance, and the obvious uses are clinical, ' +
    'not cosmetic: age thresholds for diagnosing menopause without testing, ' +
    'and POI territory under 40, are NICE guidance that must be verified ' +
    'against the source and signed off before being encoded — not inferred ' +
    'from general knowledge. The mechanism is ready: a `relevant_when` ' +
    'condition on `age_range` works today, the moment content declares one.',
}

describe('every collected question shapes the plan', () => {
  it('classifies every collected question, with no gaps and no stale entries', () => {
    const collected = collectedKeys()
    // The three bespoke steps collect answers without a `key` on the step.
    const custom = ['continent', 'heritage', 'country']
    const all = [...collected, ...custom]

    const classified = new Set([
      ...Object.keys(CONTRASTS),
      ...Object.keys(NOT_PLAN_SHAPING),
      ...Object.keys(PENDING_CLINICAL_REVIEW),
    ])

    const unclassified = all.filter((k) => !classified.has(k))
    expect(
      unclassified,
      `question(s) added without deciding how they shape the plan: ${unclassified.join(', ')}`
    ).toEqual([])

    const stale = Array.from(classified).filter((k) => !all.includes(k))
    expect(
      stale,
      `classified question(s) no longer collected: ${stale.join(', ')}`
    ).toEqual([])
  })

  it('PROFILE_KEYS are accounted for as non-plan-shaping', () => {
    for (const key of PROFILE_KEYS) {
      // menopause_stage is both a profile column AND a framework trigger.
      if (key === 'menopause_stage') continue
      expect(NOT_PLAN_SHAPING[key], `${key} is a profile key`).toBeTruthy()
    }
  })

  // The heart of it: one answer changed, plan must change.
  for (const [key, [a, b]] of Object.entries(CONTRASTS)) {
    it(`changing "${key}" changes the plan`, () => {
      const planA = renderPlan({ ...BASELINE, ...a })
      const planB = renderPlan({ ...BASELINE, ...b })

      expect(
        planA,
        `Changing "${key}" from ${JSON.stringify(a)} to ${JSON.stringify(b)} ` +
          `produced an identical plan. The question is being asked and ignored.`
      ).not.toEqual(planB)
    })
  }

  it('leaves nothing pending without a documented reason', () => {
    for (const [key, reason] of Object.entries(PENDING_CLINICAL_REVIEW)) {
      expect(reason.length, `${key} needs a real reason`).toBeGreaterThan(80)
    }
    // Tighten this as content lands. It must never grow.
    expect(Object.keys(PENDING_CLINICAL_REVIEW).length).toBeLessThanOrEqual(1)
  })
})

describe('contrast values are real onboarding choices', () => {
  /** Every declared choice value, by question key. */
  function choiceValues(key: string): string[] | null {
    const step = STEPS.find((s) => 'key' in s && s.key === key)
    if (!step) return null
    if ((step.kind === 'single' || step.kind === 'multi') && 'choices' in step && step.choices) {
      return step.choices.map((c) => c.value)
    }
    // primary_symptom derives its choices from the symptoms already picked.
    if (key === 'primary_symptom') return SYMPTOM_CHOICES.map((c) => c.value)
    return null
  }

  it('uses only values a user could actually give', () => {
    const invalid: string[] = []
    for (const [key, pair] of Object.entries(CONTRASTS)) {
      for (const spec of pair) {
        for (const [k, v] of Object.entries(spec)) {
          const valid = choiceValues(k)
          if (!valid) continue
          for (const value of Array.isArray(v) ? v : [v]) {
            if (!valid.includes(value)) invalid.push(`${key}: ${k}="${value}"`)
          }
        }
      }
    }
    expect(invalid, `contrast uses value(s) no user can select: ${invalid.join('; ')}`).toEqual([])
  })

  it('every circumstance pattern targets a real onboarding answer value', () => {
    const medical = choiceValues('medical_flags') ?? []
    const dietary = choiceValues('diet_restrictions') ?? []

    for (const p of MEDICAL_FLAG_PATTERNS) {
      expect(medical, `medical flag pattern "${p.value}" is not a real choice`).toContain(p.value)
    }
    for (const p of DIET_RESTRICTION_PATTERNS) {
      expect(dietary, `diet pattern "${p.value}" is not a real choice`).toContain(p.value)
    }
  })
})
