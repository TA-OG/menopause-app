/**
 * Dose-stacking safety guarantees.
 *
 * These tests run against the REAL framework YAML and the REAL substance
 * registry, not fixtures. That is deliberate: the defect these guard against
 * was a content/engine interaction, not a logic error in isolation. Five
 * different frameworks each carried an omega-3 card, and because the engine
 * deduplicated by recommendation ID only, a woman reporting hot flushes, brain
 * fog and joint pain received all of them — with upper bounds that read as
 * additive (2000 + 3000 + 3000 + 3000mg, plus one unspecified).
 *
 * The property test below enumerates EVERY possible combination of frameworks,
 * so the guarantee does not depend on anyone having thought of a particular
 * symptom combination.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import {
  buildPlan,
  buildSubstanceIndex,
  matchFrameworks,
  selectFocus,
  SCORE_WEIGHTS,
  UNCAUTIONED_SCORE_SPREAD,
  scoreRecommendation,
} from './wellness-engine'
import { deriveUserSignals } from './user-signals'
import { loadFrameworks } from './load-frameworks'
import { loadSubstanceRegistry } from './substance-registry'
import type {
  WellnessFramework,
  SubstanceEntry,
  WellnessRecommendation,
  OnboardingAnswer,
} from '@/types/database'

let frameworks: WellnessFramework[]
let substances: SubstanceEntry[]
let substanceIndex: Map<string, SubstanceEntry>

beforeAll(async () => {
  frameworks = await loadFrameworks()
  substances = loadSubstanceRegistry()
  substanceIndex = buildSubstanceIndex(substances)
})

/** Every subset of `items`, as an array of arrays. */
function subsets<T>(items: T[]): T[][] {
  const out: T[][] = []
  const total = 2 ** items.length
  for (let mask = 0; mask < total; mask++) {
    const subset: T[] = []
    for (let i = 0; i < items.length; i++) {
      if (mask & (1 << i)) subset.push(items[i])
    }
    out.push(subset)
  }
  return out
}

function substanceKeysOf(recs: WellnessRecommendation[]): string[] {
  return recs
    .map((rec) => substanceIndex.get(rec.id)?.key)
    .filter((key): key is string => Boolean(key))
}

describe('content and registry are in sync', () => {
  it('loads real frameworks and a non-empty registry', () => {
    expect(frameworks.length).toBeGreaterThan(0)
    expect(substances.length).toBeGreaterThan(0)
  })

  it('declares a substance for every supplement in every framework', () => {
    const undeclared: string[] = []
    for (const framework of frameworks) {
      for (const supplement of framework.supplement_suggestions ?? []) {
        if (!substanceIndex.has(supplement.id)) undeclared.push(supplement.id)
      }
    }
    expect(undeclared).toEqual([])
  })

  it('never asserts a dose ceiling without a source', () => {
    for (const substance of substances) {
      if (substance.limit_status === 'verified') {
        expect(substance.max_daily, `${substance.key} is verified`).toBeTruthy()
        expect(
          substance.max_daily?.source?.trim(),
          `${substance.key} must cite a source for its ceiling`
        ).toBeTruthy()
      } else {
        expect(
          substance.max_daily,
          `${substance.key} is unverified and must not assert a ceiling`
        ).toBeNull()
      }
    }
  })
})

describe('PROPERTY: no substance can ever stack, for any combination of frameworks', () => {
  it('holds across every possible combination of matched frameworks', () => {
    const allCombinations = subsets(frameworks)
    // Guard against the enumeration silently shrinking if frameworks are added
    expect(allCombinations.length).toBe(2 ** frameworks.length)

    const violations: string[] = []

    for (const combination of allCombinations) {
      const plan = buildPlan(combination, {}, undefined, substances)

      const keys = substanceKeysOf(plan.supplement_suggestions)
      const duplicates = keys.filter((key, i) => keys.indexOf(key) !== i)

      if (duplicates.length > 0) {
        violations.push(
          `[${combination.map((f) => f.id).join(' + ') || 'none'}] ` +
          `repeated substance(s): ${Array.from(new Set(duplicates)).join(', ')}`
        )
      }
    }

    expect(violations).toEqual([])
  })

  it('never emits the same recommendation ID twice in any category', () => {
    const violations: string[] = []

    for (const combination of subsets(frameworks)) {
      const plan = buildPlan(combination, {}, undefined, substances)
      const categories = {
        diet: plan.diet_adjustments,
        lifestyle: plan.lifestyle_adjustments,
        mindset: plan.mindset_recommendations,
        supplements: plan.supplement_suggestions,
      }

      for (const [name, recs] of Object.entries(categories)) {
        const ids = recs.map((r) => r.id)
        const dupes = ids.filter((id, i) => ids.indexOf(id) !== i)
        if (dupes.length > 0) {
          violations.push(
            `[${combination.map((f) => f.id).join(' + ')}] ${name}: ${dupes.join(', ')}`
          )
        }
      }
    }

    expect(violations).toEqual([])
  })

  it('keeps a GP-check disclaimer on every supplement, in every combination', () => {
    const violations: string[] = []

    for (const combination of subsets(frameworks)) {
      const plan = buildPlan(combination, {}, undefined, substances)
      for (const supplement of plan.supplement_suggestions) {
        if (!supplement.disclaimer || supplement.disclaimer.trim() === '') {
          violations.push(supplement.id)
        }
      }
    }

    expect(Array.from(new Set(violations))).toEqual([])
  })
})

describe('the omega-3 case that prompted this', () => {
  it('collapses all five omega-3 cards into one, with a sourced ceiling', () => {
    // Every framework that carries an omega-3 card, firing at once
    const plan = buildPlan(frameworks, {}, undefined, substances)

    const omega3 = plan.supplement_suggestions.filter(
      (rec) => substanceIndex.get(rec.id)?.key === 'omega_3_epa_dha'
    )

    expect(omega3).toHaveLength(1)
    expect(omega3[0].max_daily_note).toContain('5000mg')
    // The framing from the collapsed cards is retained, not silently dropped
    expect(omega3[0].also_for?.length ?? 0).toBeGreaterThan(0)
  })
})

describe('substances that must never be merged', () => {
  it('keeps calcium and calcium D-glucarate separate', () => {
    const plan = buildPlan(frameworks, {}, undefined, substances)
    const keys = substanceKeysOf(plan.supplement_suggestions)

    expect(keys).toContain('calcium')
    expect(keys).toContain('calcium_d_glucarate')
  })

  it('keeps collagen Type I and Type II separate', () => {
    const plan = buildPlan(frameworks, {}, undefined, substances)
    const keys = substanceKeysOf(plan.supplement_suggestions)

    expect(keys).toContain('collagen_type_i')
    expect(keys).toContain('collagen_type_ii')
  })
})

describe('preference filtering runs before deduplication', () => {
  /**
   * Regression test. Deduplication keeps the highest-priority card for a
   * substance and discards its siblings. If filtering ran afterwards, a winner
   * marked `who_for: active_only` would take the whole substance with it for a
   * user with limited mobility — including a sibling card she was eligible for.
   * Filtering first means dedup only ever chooses between cards she can use.
   */
  it('never loses a substance that still has an eligible card', () => {
    const unfiltered = buildPlan(frameworks, {}, undefined, substances)
    const limited = buildPlan(frameworks, { exercise_level: 'limited' }, undefined, substances)

    const eligibleSubstances = new Set(
      frameworks
        .flatMap((f) => f.supplement_suggestions ?? [])
        .filter((rec) => (rec.who_for ?? 'all') !== 'active_only')
        .map((rec) => substanceIndex.get(rec.id)?.key)
        .filter((key): key is string => Boolean(key))
    )

    const survived = new Set(substanceKeysOf(limited.supplement_suggestions))

    for (const key of Array.from(eligibleSubstances)) {
      expect(
        survived.has(key),
        `"${key}" has a card a limited-mobility user is eligible for, but vanished from her plan`
      ).toBe(true)
    }

    // And filtering must not silently remove everything
    expect(limited.supplement_suggestions.length).toBeGreaterThan(0)
    expect(limited.supplement_suggestions.length).toBeLessThanOrEqual(
      unfiltered.supplement_suggestions.length
    )
  })
})

describe('ceilings are only attached where verified', () => {
  it('attaches no ceiling note to substances pending clinical review', () => {
    const plan = buildPlan(frameworks, {}, undefined, substances)

    for (const rec of plan.supplement_suggestions) {
      const substance = substanceIndex.get(rec.id)
      if (substance && substance.limit_status === 'needs_clinical_review') {
        expect(
          rec.max_daily_note,
          `${rec.id} must not carry an invented ceiling`
        ).toBeUndefined()
      }
    }
  })
})

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * DECLARED MEDICAL FLAGS AND DIETARY RESTRICTIONS
 *
 * These answers were collected from every user since launch and read by
 * nothing. Wiring them up creates two new ways to cause harm, and these tests
 * exist to close both:
 *
 *   1. A cautioned supplement leading her plan — the caution present but too
 *      far down to be read before she buys something.
 *   2. A card silently vanishing because she declared something — which looks
 *      like safety and is the opposite. Suppression would hide the very
 *      caution she most needs, and on THIS content it also misfires: every
 *      omega-3 card already offers algae oil as the plant-based equivalent, so
 *      dropping it for a vegan would delete advice written to be vegan-safe.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe('declared circumstances de-rank but never remove', () => {
  const SEVERE_MULTI: OnboardingAnswer[] = [
    { id: '1', user_id: 'u', question_key: 'menopause_stage', answer_value: 'postmenopause', answered_at: '' },
    ...['hot_flashes', 'sleep_problems', 'joint_pain', 'skin_changes', 'anxiety'].map(
      (s, i) => ({ id: `s${i}`, user_id: 'u', question_key: 'symptoms', answer_value: s, answered_at: '' })
    ),
    { id: 'p', user_id: 'u', question_key: 'primary_symptom', answer_value: 'joint_pain', answered_at: '' },
    { id: 'sev', user_id: 'u', question_key: 'symptom_severity', answer_value: 'severe', answered_at: '' },
  ]

  const withFlag = (flag: string): OnboardingAnswer[] => [
    ...SEVERE_MULTI,
    { id: 'f', user_id: 'u', question_key: 'medical_flags', answer_value: flag, answered_at: '' },
  ]

  function planFor(answers: OnboardingAnswer[]) {
    const signals = deriveUserSignals(answers, {})
    const matched = matchFrameworks(answers, frameworks)
    return {
      signals,
      plan: buildPlan(matched, {}, signals.primary_symptom, substances, signals),
    }
  }

  it('the caution weight provably dominates every other signal combined', () => {
    // A cautioned card must fall below the LOWEST-scoring uncautioned one, not
    // merely below an identical twin — so the bound is the full spread of
    // achievable uncautioned scores, penalties included. Taking only
    // PRIORITY_HIGH + bonuses - PRIORITY_LOW understates it: the floor moved
    // down when NOT_RELEVANT was added, and a bound that ignores penalties
    // would silently stop being sufficient the next time one is added.
    expect(
      Math.abs(SCORE_WEIGHTS.CAUTION_DECLARED),
      `CAUTION_DECLARED must exceed the uncautioned spread (${UNCAUTIONED_SCORE_SPREAD}) ` +
        `or a cautioned card can outrank an uncautioned one`
    ).toBeGreaterThan(UNCAUTIONED_SCORE_SPREAD)
  })

  it('no real recommendation can beat a cautioned one, at any weighting', () => {
    // The arithmetic bound above, demonstrated on the actual content: score
    // every card in a full plan for a user declaring each flag, and require
    // every cautioned card to sit below every uncautioned one.
    for (const flag of ['blood_thinners', 'thyroid', 'diabetes']) {
      const { plan, signals } = planFor(withFlag(flag))
      const all = [
        ...plan.diet_adjustments,
        ...plan.lifestyle_adjustments,
        ...plan.mindset_recommendations,
        ...plan.supplement_suggestions,
      ]
      const scored = all.map((r) => ({
        id: r.id,
        cautioned: Boolean(r.personal_note),
        score: scoreRecommendation(r, signals),
      }))
      const worstUncautioned = Math.min(
        ...scored.filter((s) => !s.cautioned).map((s) => s.score)
      )
      for (const s of scored.filter((s) => s.cautioned)) {
        expect(
          s.score,
          `[${flag}] cautioned "${s.id}" scored ${s.score}, at or above the worst ` +
            `uncautioned card (${worstUncautioned})`
        ).toBeLessThan(worstUncautioned)
      }
    }
  })

  it('removes nothing at all when a flag is declared', () => {
    const base = planFor(SEVERE_MULTI).plan
    const flagged = planFor(withFlag('blood_thinners')).plan

    const ids = (p: typeof base) =>
      [
        ...p.diet_adjustments,
        ...p.lifestyle_adjustments,
        ...p.mindset_recommendations,
        ...p.supplement_suggestions,
      ]
        .map((r) => r.id)
        .sort()

    // Same recommendations, start to finish. Only the order and the notes move.
    expect(ids(flagged)).toEqual(ids(base))
  })

  it('surfaces a personal note on every card that cautions about her flag', () => {
    const { plan } = planFor(withFlag('blood_thinners'))
    const noted = plan.supplement_suggestions.filter((r) => r.personal_note)

    // Anticoagulants are cautioned on omega-3, K2, ginkgo, vitamin E,
    // curcumin, glucosamine and the enzyme blends — several must survive
    // dedupe into any plan this broad.
    expect(noted.length).toBeGreaterThan(0)
    for (const rec of noted) {
      expect(rec.personal_note?.because).toContain('blood_thinners')
      expect(rec.personal_note?.kind).toBe('caution')
      // The note must never replace the author's own disclaimer.
      expect(rec.disclaimer?.trim()).toBeTruthy()
    }
  })

  it('never lets a cautioned recommendation lead her plan', () => {
    for (const flag of ['blood_thinners', 'pregnant_breastfeeding', 'thyroid', 'diabetes']) {
      const { plan, signals } = planFor(withFlag(flag))
      const focus = selectFocus(plan, signals, 5)

      for (const rec of focus) {
        expect(
          rec.personal_note,
          `[${flag}] "${rec.id}" carries a caution she declared and is still in her top 5`
        ).toBeUndefined()
      }
    }
  })

  it('keeps every cautioned card reachable, with its caution intact', () => {
    const { plan } = planFor(withFlag('blood_thinners'))
    const cautioned = plan.supplement_suggestions.filter(
      (r) => r.personal_note?.because.includes('blood_thinners')
    )
    for (const rec of cautioned) {
      // Still in the plan, still carrying everything a reader needs.
      expect(plan.supplement_suggestions).toContain(rec)
      expect(rec.disclaimer).toBeTruthy()
      expect(rec.personal_note?.text).toMatch(/GP or pharmacist/)
    }
  })

  it('treats a dietary restriction as adaptation, not exclusion', () => {
    const answers: OnboardingAnswer[] = [
      ...SEVERE_MULTI,
      { id: 'd', user_id: 'u', question_key: 'diet_restrictions', answer_value: 'shellfish_allergy', answered_at: '' },
    ]
    const { plan } = planFor(answers)
    const adapted = plan.supplement_suggestions.filter((r) =>
      r.personal_note?.because.includes('shellfish_allergy')
    )

    // Collagen and glucosamine both name shellfish sourcing in their own copy.
    expect(adapted.length).toBeGreaterThan(0)
    for (const rec of adapted) {
      expect(rec.personal_note?.kind).toBe('adapt')
      expect(plan.supplement_suggestions).toContain(rec)
    }
  })

  it('adds no note for a flag she did not declare', () => {
    const { plan } = planFor(SEVERE_MULTI)
    const all = [
      ...plan.diet_adjustments,
      ...plan.lifestyle_adjustments,
      ...plan.mindset_recommendations,
      ...plan.supplement_suggestions,
    ]
    expect(all.every((r) => r.personal_note === undefined)).toBe(true)
  })
})
