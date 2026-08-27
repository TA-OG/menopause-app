/**
 * The collapse rule, tested against the REAL framework content.
 *
 * The redesign's whole risk is here: a plan that collapses is easier to read,
 * and a plan that collapses the wrong half is more dangerous than the
 * scroll-fest it replaced. These tests are what stop the second thing.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import {
  planCardContent,
  SAFETY_CRITICAL_FIELDS,
  BODY_PREVIEW_CHARS,
} from './plan-card-content'
import { buildPlan, matchFrameworks } from './wellness-engine'
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

beforeAll(async () => {
  frameworks = await loadFrameworks()
  substances = loadSubstanceRegistry()
})

/** A broad plan for a woman declaring flags, so notes and ceilings are present. */
function realPlan(flags: string[] = ['blood_thinners']) {
  const answers: OnboardingAnswer[] = [
    { id: 'st', user_id: 'u', question_key: 'menopause_stage', answer_value: 'postmenopause', answered_at: '' },
    ...['hot_flashes', 'sleep_problems', 'joint_pain', 'skin_changes', 'anxiety', 'weight_changes'].map(
      (s, i) => ({ id: `s${i}`, user_id: 'u', question_key: 'symptoms', answer_value: s, answered_at: '' })
    ),
    { id: 'p', user_id: 'u', question_key: 'primary_symptom', answer_value: 'sleep_problems', answered_at: '' },
    { id: 'sev', user_id: 'u', question_key: 'symptom_severity', answer_value: 'severe', answered_at: '' },
    ...flags.map((f, i) => ({ id: `f${i}`, user_id: 'u', question_key: 'medical_flags', answer_value: f, answered_at: '' })),
  ]
  const signals = deriveUserSignals(answers, {})
  const plan = buildPlan(matchFrameworks(answers, frameworks), {}, signals.primary_symptom, substances, signals)
  return [
    ...plan.diet_adjustments,
    ...plan.lifestyle_adjustments,
    ...plan.mindset_recommendations,
    ...plan.supplement_suggestions,
  ]
}

describe('safety copy is never collapsible', () => {
  it('surfaces every disclaimer in the real plan as an always-visible line', () => {
    const missing: string[] = []
    for (const rec of realPlan()) {
      if (!rec.disclaimer?.trim()) continue
      const content = planCardContent(rec)
      const shown = content.safetyLines.some(
        (l) => l.kind === 'gp_check' && l.text === rec.disclaimer!.trim()
      )
      if (!shown) missing.push(rec.id)
    }
    expect(missing, `disclaimer(s) not surfaced: ${missing.join(', ')}`).toEqual([])
  })

  it('surfaces every cumulative dose ceiling', () => {
    const missing: string[] = []
    for (const rec of realPlan()) {
      if (!rec.max_daily_note?.trim()) continue
      const content = planCardContent(rec)
      if (!content.safetyLines.some((l) => l.kind === 'ceiling')) missing.push(rec.id)
    }
    expect(missing, `dose ceiling(s) not surfaced: ${missing.join(', ')}`).toEqual([])
  })

  it('surfaces every personal note, for each declared flag', () => {
    for (const flag of ['blood_thinners', 'thyroid', 'diabetes', 'pregnant_breastfeeding']) {
      const noted = realPlan([flag]).filter((r) => r.personal_note)
      expect(noted.length, `no personal notes for ${flag}`).toBeGreaterThan(0)
      for (const rec of noted) {
        const content = planCardContent(rec)
        expect(
          content.safetyLines.some((l) => l.kind === 'personal'),
          `[${flag}] "${rec.id}" has a personal note that would be collapsed`
        ).toBe(true)
      }
    }
  })

  it('puts her personal note FIRST — above the ceiling and the GP check', () => {
    const noted = realPlan(['blood_thinners']).filter(
      (r) => r.personal_note && r.disclaimer
    )
    expect(noted.length).toBeGreaterThan(0)
    for (const rec of noted) {
      expect(planCardContent(rec).safetyLines[0].kind).toBe('personal')
    }
  })

  it('never puts safety copy in the collapsible half', () => {
    for (const rec of realPlan()) {
      const { body, alsoFor } = planCardContent(rec)
      const collapsible = [body, ...alsoFor].join(' ')
      for (const field of ['disclaimer', 'max_daily_note'] as const) {
        const value = rec[field]?.trim()
        if (!value) continue
        expect(
          collapsible.includes(value),
          `"${rec.id}" leaked ${field} into the collapsible region`
        ).toBe(false)
      }
    }
  })

  /**
   * The one that catches the mistake nobody notices: someone adds a new
   * safety-carrying field to WellnessRecommendation, wires it into the engine,
   * and forgets this file — so it silently becomes collapsible.
   */
  it('accounts for every safety-critical field the type declares', () => {
    const rec: WellnessRecommendation = {
      id: 'probe',
      title: 'Probe',
      body: 'x'.repeat(BODY_PREVIEW_CHARS + 50),
      priority: 'high',
      category: 'supplement',
      disclaimer: 'GP-CHECK-SENTINEL',
      max_daily_note: 'CEILING-SENTINEL',
      personal_note: { kind: 'caution', because: ['thyroid'], text: 'PERSONAL-SENTINEL' },
    }
    const lines = planCardContent(rec).safetyLines
    expect(lines).toHaveLength(SAFETY_CRITICAL_FIELDS.length)
    for (const sentinel of ['PERSONAL-SENTINEL', 'CEILING-SENTINEL', 'GP-CHECK-SENTINEL']) {
      expect(
        lines.some((l) => l.text === sentinel),
        `${sentinel} is not surfaced — a safety field was added without updating planCardContent()`
      ).toBe(true)
    }
  })
})

describe('collapsing behaviour', () => {
  it('offers no toggle on a card with nothing worth expanding', () => {
    const short = planCardContent({
      id: 's', title: 'Short', body: 'Two words.', priority: 'low', category: 'lifestyle',
    })
    expect(short.isExpandable).toBe(false)
  })

  it('offers a toggle on a long card', () => {
    const long = planCardContent({
      id: 'l', title: 'Long', body: 'word '.repeat(100), priority: 'low', category: 'lifestyle',
    })
    expect(long.isExpandable).toBe(true)
  })

  it('offers a toggle when a substance was collapsed from several frameworks', () => {
    const merged = planCardContent({
      id: 'm', title: 'Merged', body: 'Short.', priority: 'low', category: 'supplement',
      also_for: ['Also for hot flushes'],
    })
    expect(merged.isExpandable).toBe(true)
  })

  it('keeps the whole body — collapsing is visual, never truncation', () => {
    for (const rec of realPlan()) {
      if (!rec.body?.trim()) continue
      expect(planCardContent(rec).body).toBe(rec.body.trim())
    }
  })

  it('actually shortens the real plan — most cards have something to collapse', () => {
    const cards = realPlan().map(planCardContent)
    const expandable = cards.filter((c) => c.isExpandable).length
    // If this ever drops near zero the redesign has stopped doing its job.
    expect(expandable / cards.length).toBeGreaterThan(0.5)
  })
})
