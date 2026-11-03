import { describe, it, expect } from 'vitest'
import { SAFETY_QUESTIONS_REVISED_AT, reviewSafetyAnswers } from './safety-review'
import { STEPS } from './onboarding-config'

const AFTER = '2026-10-31T09:00:00Z'
const BEFORE = '2026-10-01T09:00:00Z'

const row = (question_key: string, answer_value: string, answered_at = AFTER) => ({
  question_key,
  answer_value,
  answered_at,
})

describe('reviewSafetyAnswers', () => {
  it('passes when both questions have a current answer', () => {
    expect(
      reviewSafetyAnswers([row('medical_flags', 'on_hrt'), row('diet_restrictions', 'vegan')])
    ).toEqual({ required: false, missing: [] })
  })

  it('treats "none" as an answer', () => {
    expect(
      reviewSafetyAnswers([row('medical_flags', 'none'), row('diet_restrictions', 'none')]).required
    ).toBe(false)
  })

  it('treats a question with no rows as unknown, never as none', () => {
    expect(reviewSafetyAnswers([row('medical_flags', 'none')])).toEqual({
      required: true,
      missing: ['diet_restrictions'],
    })
    expect(reviewSafetyAnswers([]).missing).toEqual(['medical_flags', 'diet_restrictions'])
  })

  it('asks again when the answer predates the current questions', () => {
    expect(
      reviewSafetyAnswers([row('medical_flags', 'none', BEFORE), row('diet_restrictions', 'none')])
    ).toEqual({ required: true, missing: ['medical_flags'] })
  })

  it('asks again when any row of a multi-select is stale', () => {
    const answers = [
      row('medical_flags', 'thyroid', BEFORE),
      row('medical_flags', 'on_hrt'),
      row('diet_restrictions', 'none'),
    ]
    expect(reviewSafetyAnswers(answers).missing).toEqual(['medical_flags'])
  })

  it('refuses an unreadable timestamp rather than trusting it', () => {
    expect(
      reviewSafetyAnswers([row('medical_flags', 'none', 'yesterday'), row('diet_restrictions', 'none')])
        .required
    ).toBe(true)
  })

  it('is dated on or after the questions it guards were last changed', () => {
    expect(Date.parse(SAFETY_QUESTIONS_REVISED_AT)).not.toBeNaN()
  })
})

describe('the safety questions themselves', () => {
  for (const key of ['medical_flags', 'diet_restrictions']) {
    it(`${key} cannot be left empty, and offers an explicit "none"`, () => {
      const step = STEPS.find((s) => 'key' in s && s.key === key)
      expect(step?.kind).toBe('multi')
      if (step?.kind !== 'multi') return
      expect(step.minSelect ?? 0).toBeGreaterThanOrEqual(1)
      const none = step.choices.find((c) => c.value === 'none')
      expect(none?.exclusive).toBe(true)
    })
  }
})
