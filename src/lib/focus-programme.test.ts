import { describe, it, expect, beforeAll } from 'vitest'
import {
  ALTERNATIVES_COUNT,
  FOCUS_SYMPTOMS_MAX,
  FOCUS_SYMPTOMS_MIN,
  MAX_CHANGES_ON_CHECKIN,
  REVIEW_AFTER_DAYS,
  canKeepAnother,
  changesOnCheckin,
  daysBetween,
  focusSymptomOptions,
  isEligibleForWeek,
  isReviewDue,
  keptChanges,
  nextSequence,
  normaliseFocusSymptoms,
  openWeek,
  selectWeeklyChange,
  usedRecommendationIds,
  weekSnapshot,
} from './focus-programme'
import { buildPlan, matchFrameworks } from './wellness-engine'
import { deriveUserSignals } from './user-signals'
import { loadFrameworks } from './load-frameworks'
import { loadSubstanceRegistry } from './substance-registry'
import type {
  FocusWeek,
  OnboardingAnswer,
  SymptomKey,
  UserSignals,
  WellnessFramework,
  WellnessRecommendation,
} from '@/types/database'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function signals(overrides: Partial<UserSignals> = {}): UserSignals {
  return {
    symptoms: ['hot_flashes', 'sleep_problems', 'anxiety', 'fatigue'],
    primary_symptom: 'sleep_problems',
    diet_restrictions: [],
    medical_flags: [],
    previously_tried: [],
    ...overrides,
  }
}

function rec(
  id: string,
  category: WellnessRecommendation['category'],
  targets: string[],
  extra: Partial<WellnessRecommendation> = {}
): WellnessRecommendation {
  return {
    id,
    title: `Title ${id}`,
    body: `Body ${id}`,
    priority: 'medium',
    category,
    targets_symptoms: targets,
    ...extra,
  }
}

function plan(recs: WellnessRecommendation[]) {
  return {
    diet_adjustments: recs.filter((r) => r.category === 'diet'),
    lifestyle_adjustments: recs.filter((r) => r.category === 'lifestyle'),
    mindset_recommendations: recs.filter((r) => r.category === 'mindset'),
    supplement_suggestions: recs.filter((r) => r.category === 'supplement'),
  }
}

type W = Pick<FocusWeek, 'sequence' | 'recommendation_id' | 'starts_on' | 'outcome' | 'released_on'>

function week(sequence: number, overrides: Partial<W> = {}): W {
  return {
    sequence,
    recommendation_id: `r${sequence}`,
    starts_on: '2026-10-01',
    outcome: null,
    released_on: null,
    ...overrides,
  }
}

// ─── Limits ───────────────────────────────────────────────────────────────────

describe('agreed limits', () => {
  // These mirror CHECK constraints in 036_focus_programmes.sql and the decisions
  // in docs/focus-programme.md. Changing one here means changing it there too.
  it('match the agreed decisions and the migration', () => {
    expect(FOCUS_SYMPTOMS_MIN).toBe(1)
    expect(FOCUS_SYMPTOMS_MAX).toBe(3)
    expect(MAX_CHANGES_ON_CHECKIN).toBe(3)
    expect(REVIEW_AFTER_DAYS).toBe(7)
    expect(ALTERNATIVES_COUNT).toBe(2)
  })
})

// ─── Focus symptoms ───────────────────────────────────────────────────────────

describe('focusSymptomOptions', () => {
  it('offers only what she declared, primary first, then intake order', () => {
    const s = signals({
      symptoms: ['fatigue', 'hot_flashes', 'anxiety'],
      primary_symptom: 'anxiety',
    })
    expect(focusSymptomOptions(s)).toEqual(['anxiety', 'hot_flashes', 'fatigue'])
  })

  it('never offers other, unknown values, or duplicates', () => {
    const s = signals({
      symptoms: ['other', 'headache', 'fatigue', 'fatigue'],
      primary_symptom: undefined,
    })
    expect(focusSymptomOptions(s)).toEqual(['fatigue'])
  })
})

describe('normaliseFocusSymptoms', () => {
  const s = signals()

  it('accepts 1 to 3 of her declared symptoms', () => {
    expect(normaliseFocusSymptoms(['anxiety'], s)).toEqual({ ok: true, symptoms: ['anxiety'] })
    expect(normaliseFocusSymptoms(['anxiety', 'fatigue', 'hot_flashes'], s).ok).toBe(true)
  })

  it('collapses duplicates', () => {
    expect(normaliseFocusSymptoms(['anxiety', 'anxiety'], s)).toEqual({
      ok: true,
      symptoms: ['anxiety'],
    })
  })

  it('refuses none, more than 3, or a symptom she did not declare', () => {
    expect(normaliseFocusSymptoms([], s).ok).toBe(false)
    expect(
      normaliseFocusSymptoms(['anxiety', 'fatigue', 'hot_flashes', 'sleep_problems'], s).ok
    ).toBe(false)
    expect(normaliseFocusSymptoms(['joint_pain'], s).ok).toBe(false)
    expect(normaliseFocusSymptoms(['other'], s).ok).toBe(false)
  })
})

// ─── Eligibility ──────────────────────────────────────────────────────────────

describe('isEligibleForWeek', () => {
  it('never lets a supplement lead a week', () => {
    expect(isEligibleForWeek(rec('s', 'supplement', ['anxiety']), signals())).toBe(false)
  })

  it('accepts diet, lifestyle and mindset', () => {
    for (const c of ['diet', 'lifestyle', 'mindset'] as const) {
      expect(isEligibleForWeek(rec(c, c, ['anxiety']), signals())).toBe(true)
    }
  })

  it('skips a change already used in this programme', () => {
    expect(isEligibleForWeek(rec('x', 'diet', []), signals(), new Set(['x']))).toBe(false)
  })

  it('skips active_only for limited or not-active exercise', () => {
    const r = rec('hiit', 'lifestyle', ['fatigue'], { who_for: 'active_only' })
    expect(isEligibleForWeek(r, signals({ exercise_level: 'limited' }))).toBe(false)
    expect(isEligibleForWeek(r, signals({ exercise_level: 'not_active' }))).toBe(false)
    expect(isEligibleForWeek(r, signals({ exercise_level: 'very_active' }))).toBe(true)
  })

  it('skips a card cautioned for something she declared', () => {
    const r = rec('d', 'diet', ['fatigue'], {
      disclaimer: 'Check with your GP if you take warfarin.',
    })
    expect(isEligibleForWeek(r, signals({ medical_flags: ['blood_thinners'] }))).toBe(false)
    // The same card is fine for someone who declared nothing it cautions about.
    expect(isEligibleForWeek(r, signals())).toBe(true)
  })

  it('skips a card needing adaptation for a restriction she declared', () => {
    const r = rec('d', 'diet', ['joint_pain'], { adapt_for: ['shellfish_allergy'] })
    expect(isEligibleForWeek(r, signals({ diet_restrictions: ['shellfish_allergy'] }))).toBe(false)
  })
})

// ─── Selection ────────────────────────────────────────────────────────────────

describe('selectWeeklyChange', () => {
  it('picks the change covering the most of her focus symptoms', () => {
    const p = plan([
      rec('one', 'diet', ['sleep_problems'], { priority: 'high' }),
      rec('two', 'lifestyle', ['sleep_problems', 'anxiety']),
    ])
    const result = selectWeeklyChange(p, ['sleep_problems', 'anxiety'], signals())
    expect(result.pick?.rec.id).toBe('two')
    expect(result.pick?.covers).toEqual(['sleep_problems', 'anxiety'])
    expect(result.closestMatch).toBe(false)
    expect(result.alternatives.map((a) => a.rec.id)).toEqual(['one'])
  })

  it('breaks coverage ties by score, then id — the same answer every time', () => {
    const p = plan([
      rec('b', 'mindset', ['anxiety']),
      rec('a', 'mindset', ['anxiety']),
      rec('high', 'diet', ['anxiety'], { priority: 'high' }),
    ])
    const ids = () =>
      [selectWeeklyChange(p, ['anxiety'], signals())].map((r) => [
        r.pick?.rec.id,
        ...r.alternatives.map((a) => a.rec.id),
      ])[0]
    expect(ids()).toEqual(['high', 'a', 'b'])
    // Input order must not change the result.
    const reversed = plan([...p.mindset_recommendations].reverse().concat(p.diet_adjustments))
    const again = selectWeeklyChange(reversed, ['anxiety'], signals())
    expect([again.pick?.rec.id, ...again.alternatives.map((a) => a.rec.id)]).toEqual(ids())
  })

  it('never picks a supplement, even one covering every focus symptom', () => {
    const p = plan([
      rec('supp', 'supplement', ['sleep_problems', 'anxiety'], { priority: 'high', disclaimer: 'GP' }),
      rec('walk', 'lifestyle', ['anxiety']),
    ])
    const result = selectWeeklyChange(p, ['sleep_problems', 'anxiety'], signals())
    expect(result.pick?.rec.id).toBe('walk')
    expect(result.alternatives).toHaveLength(0)
  })

  it('reports a closest match and the symptoms nothing covers', () => {
    const p = plan([rec('walk', 'lifestyle', ['anxiety'])])
    const result = selectWeeklyChange(p, ['anxiety', 'hot_flashes'], signals())
    expect(result.pick?.rec.id).toBe('walk')
    expect(result.closestMatch).toBe(true)
    expect(result.uncovered).toEqual(['hot_flashes'])
  })

  it('returns no pick rather than an unrelated change when nothing fits', () => {
    const p = plan([rec('walk', 'lifestyle', ['anxiety']), rec('untagged', 'diet', [])])
    const result = selectWeeklyChange(p, ['hot_flashes'], signals())
    expect(result.pick).toBeNull()
    expect(result.alternatives).toEqual([])
    expect(result.closestMatch).toBe(false)
    expect(result.uncovered).toEqual(['hot_flashes'])
  })

  it('does not offer a change already used', () => {
    const p = plan([rec('a', 'diet', ['anxiety']), rec('b', 'diet', ['anxiety'])])
    expect(selectWeeklyChange(p, ['anxiety'], signals(), ['a']).pick?.rec.id).toBe('b')
  })

  it('offers at most ALTERNATIVES_COUNT alternatives', () => {
    const p = plan(['a', 'b', 'c', 'd', 'e'].map((id) => rec(id, 'diet', ['anxiety'])))
    expect(selectWeeklyChange(p, ['anxiety'], signals()).alternatives).toHaveLength(
      ALTERNATIVES_COUNT
    )
  })
})

describe('weekSnapshot', () => {
  it('copies the authored wording verbatim', () => {
    const r = rec('x', 'diet', ['anxiety'], { body: 'Exact words, unchanged.' })
    expect(weekSnapshot(r)).toEqual({
      title: 'Title x',
      body: 'Exact words, unchanged.',
      category: 'diet',
      targets_symptoms: ['anxiety'],
    })
  })
})

// ─── Weeks ────────────────────────────────────────────────────────────────────

describe('daysBetween / isReviewDue', () => {
  it('counts calendar days', () => {
    expect(daysBetween('2026-10-01', '2026-10-08')).toBe(7)
    expect(daysBetween('2026-12-28', '2027-01-04')).toBe(7)
    expect(daysBetween('2026-10-08', '2026-10-01')).toBe(-7)
  })

  it('is not thrown off by the clocks changing (UK: 25 Oct 2026, 28 Mar 2027)', () => {
    expect(daysBetween('2026-10-22', '2026-10-29')).toBe(7)
    expect(daysBetween('2027-03-25', '2027-04-01')).toBe(7)
  })

  it('returns null for an impossible date', () => {
    expect(daysBetween('2026-02-30', '2026-03-05')).toBeNull()
  })

  it('opens the review on day 7, never before', () => {
    expect(isReviewDue('2026-10-01', '2026-10-07')).toBe(false)
    expect(isReviewDue('2026-10-01', '2026-10-08')).toBe(true)
    expect(isReviewDue('2026-10-01', '2026-10-30')).toBe(true)
    expect(isReviewDue('not-a-date', '2026-10-30')).toBe(false)
  })
})

describe('week helpers', () => {
  const weeks = [
    week(1, { outcome: 'kept' }),
    week(2, { outcome: 'stopped' }),
    week(3, { outcome: 'kept', released_on: '2026-10-20' }),
    week(4, { outcome: 'kept' }),
    week(5, { outcome: 'swapped' }),
    week(6),
  ]

  it('finds the open week', () => {
    expect(openWeek(weeks)?.sequence).toBe(6)
    expect(openWeek([week(1, { outcome: 'kept' })])).toBeNull()
  })

  it('lists kept, unreleased changes, most recent first', () => {
    expect(keptChanges(weeks).map((w) => w.sequence)).toEqual([4, 1])
  })

  it('puts this week first on the check-in, then kept changes', () => {
    expect(changesOnCheckin(weeks).map((w) => w.sequence)).toEqual([6, 4, 1])
  })

  it('refuses a keep that would push the check-in past the limit', () => {
    expect(canKeepAnother([week(1)])).toBe(true)
    expect(canKeepAnother([week(1, { outcome: 'kept' }), week(2)])).toBe(true)
    // Two kept + this one + next week's = 4 > 3: she must drop one first.
    expect(canKeepAnother(weeks)).toBe(false)
  })

  it('never lets the check-in exceed the limit when keeps are gated', () => {
    // Simulate reviewing every week as "kept" whenever allowed.
    const history: W[] = []
    for (let seq = 1; seq <= 10; seq++) {
      history.push(week(seq))
      expect(changesOnCheckin(history).length).toBeLessThanOrEqual(MAX_CHANGES_ON_CHECKIN)
      history[history.length - 1] = {
        ...history[history.length - 1],
        outcome: canKeepAnother(history) ? 'kept' : 'stopped',
      }
    }
  })

  it('tracks used ids and the next sequence', () => {
    expect(usedRecommendationIds(weeks)).toEqual(['r1', 'r2', 'r3', 'r4', 'r5', 'r6'])
    expect(nextSequence(weeks)).toBe(7)
    expect(nextSequence([])).toBe(1)
  })
})

// ─── Against the real content ─────────────────────────────────────────────────

describe('selectWeeklyChange on the real frameworks', () => {
  let frameworks: WellnessFramework[]

  beforeAll(async () => {
    frameworks = await loadFrameworks()
  })

  function answer(question_key: string, answer_value: string): OnboardingAnswer {
    return { id: `${question_key}-${answer_value}`, user_id: 'u', question_key, answer_value, answered_at: '' }
  }

  function realPlan(answers: OnboardingAnswer[]) {
    const s = deriveUserSignals(answers, {})
    const built = buildPlan(
      matchFrameworks(answers, frameworks),
      {},
      s.primary_symptom,
      loadSubstanceRegistry(),
      s
    )
    return { s, built }
  }

  const base = [
    answer('symptoms', 'sleep_problems'),
    answer('symptoms', 'anxiety'),
    answer('symptoms', 'fatigue'),
    answer('symptoms', 'mood_changes'),
    answer('primary_symptom', 'sleep_problems'),
    answer('symptom_severity', 'moderate'),
    answer('stress_level', 'high'),
    answer('sleep_quality', 'poor'),
  ]

  it('picks a tagged, non-supplement change that covers her focus', () => {
    const { s, built } = realPlan(base)
    const focus: SymptomKey[] = ['sleep_problems', 'anxiety', 'fatigue']
    const result = selectWeeklyChange(built, focus, s)

    expect(result.pick).not.toBeNull()
    for (const c of [result.pick!, ...result.alternatives]) {
      expect(c.rec.category).not.toBe('supplement')
      expect(c.covers.length).toBeGreaterThan(0)
      for (const sym of c.covers) expect(c.rec.targets_symptoms).toContain(sym)
    }
  })

  it('walks a whole programme without ever repeating a change', () => {
    const { s, built } = realPlan(base)
    const used: string[] = []
    for (let i = 0; i < 50; i++) {
      const { pick } = selectWeeklyChange(built, ['sleep_problems', 'anxiety'], s, used)
      if (!pick) break
      expect(used).not.toContain(pick.rec.id)
      used.push(pick.rec.id)
    }
    expect(used.length).toBeGreaterThan(0)
  })

  // HONEST SCOPE: as of 2026-10-08 no diet/lifestyle/mindset card carries a
  // caution (only supplements do), so on today's content this cannot exclude
  // anything — the exclusion itself is proven by the fixture tests in
  // `isEligibleForWeek`. This stays as a tripwire: the first non-supplement
  // card authored with a caution is checked here automatically.
  it('never picks a card cautioned for a flag she declared', () => {
    const flags = ['blood_thinners', 'thyroid', 'diabetes', 'oestrogen_sensitive',
      'pregnant_breastfeeding', 'kidney_stones', 'high_blood_pressure']
    const { s, built } = realPlan([...base, ...flags.map((f) => answer('medical_flags', f))])
    const used: string[] = []
    for (let i = 0; i < 50; i++) {
      const { pick } = selectWeeklyChange(built, ['sleep_problems', 'anxiety', 'fatigue'], s, used)
      if (!pick) break
      expect(isEligibleForWeek(pick.rec, s)).toBe(true)
      used.push(pick.rec.id)
    }
    expect(used.length).toBeGreaterThan(0)
  })
})
