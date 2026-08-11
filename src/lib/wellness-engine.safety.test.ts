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
import { buildPlan, buildSubstanceIndex } from './wellness-engine'
import { loadFrameworks } from './load-frameworks'
import { loadSubstanceRegistry } from './substance-registry'
import type {
  WellnessFramework,
  SubstanceEntry,
  WellnessRecommendation,
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
