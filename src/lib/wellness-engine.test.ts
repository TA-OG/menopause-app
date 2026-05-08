import { describe, it, expect } from 'vitest'
import {
  matchFrameworks,
  buildPlan,
  applyTierGating,
  validateFrameworks,
} from './wellness-engine'
import type { WellnessFramework, OnboardingAnswer } from '@/types/database'

const mockFramework: WellnessFramework = {
  id: 'hot-flashes',
  label: 'Hot Flushes',
  trigger_conditions: [
    { question: 'primary_symptom', answer: 'hot_flashes' },
    { question: 'symptom_severity', answer: ['moderate', 'severe'], min_matches: 1 },
  ],
  diet_adjustments: [
    { id: 'reduce-caffeine', title: 'Reduce caffeine', body: '...', priority: 'high', category: 'diet' },
  ],
  lifestyle_adjustments: [
    { id: 'layer-clothing', title: 'Layer clothing', body: '...', priority: 'medium', category: 'lifestyle' },
  ],
  mindset_recommendations: [
    { id: 'paced-breathing', title: 'Paced breathing', body: '...', priority: 'medium', category: 'mindset' },
  ],
  supplement_suggestions: [
    {
      id: 'magnesium',
      title: 'Magnesium glycinate',
      body: '...',
      priority: 'low',
      category: 'supplement',
      disclaimer: 'Always check with your GP before starting any new supplement.',
    },
  ],
  content_module_ids: ['understanding-hot-flashes'],
}

const mockAnswers: OnboardingAnswer[] = [
  { id: '1', user_id: 'u1', question_key: 'primary_symptom', answer_value: 'hot_flashes', answered_at: '' },
  { id: '2', user_id: 'u1', question_key: 'symptom_severity', answer_value: 'severe', answered_at: '' },
]

describe('matchFrameworks', () => {
  it('matches framework when all conditions are met', () => {
    const result = matchFrameworks(mockAnswers, [mockFramework])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('hot-flashes')
  })

  it('does not match when conditions are not met', () => {
    const answers: OnboardingAnswer[] = [
      { id: '1', user_id: 'u1', question_key: 'primary_symptom', answer_value: 'anxiety', answered_at: '' },
    ]
    const result = matchFrameworks(answers, [mockFramework])
    expect(result).toHaveLength(0)
  })

  it('matches with array answer options', () => {
    const answers: OnboardingAnswer[] = [
      { id: '1', user_id: 'u1', question_key: 'primary_symptom', answer_value: 'hot_flashes', answered_at: '' },
      { id: '2', user_id: 'u1', question_key: 'symptom_severity', answer_value: 'moderate', answered_at: '' },
    ]
    const result = matchFrameworks(answers, [mockFramework])
    expect(result).toHaveLength(1)
  })
})

describe('buildPlan', () => {
  it('builds a plan from matched frameworks', () => {
    const plan = buildPlan([mockFramework])
    expect(plan.framework_ids).toContain('hot-flashes')
    expect(plan.diet_adjustments).toHaveLength(1)
    expect(plan.supplement_suggestions).toHaveLength(1)
  })

  it('deduplicates recommendations across frameworks', () => {
    const duplicate = { ...mockFramework, id: 'hot-flashes-2' }
    const plan = buildPlan([mockFramework, duplicate])
    expect(plan.diet_adjustments).toHaveLength(1) // deduplicated
  })

  it('sorts by priority — high before medium before low', () => {
    const framework: WellnessFramework = {
      ...mockFramework,
      lifestyle_adjustments: [
        { id: 'low-rec', title: 'Low', body: '', priority: 'low', category: 'lifestyle' },
        { id: 'high-rec', title: 'High', body: '', priority: 'high', category: 'lifestyle' },
        { id: 'med-rec', title: 'Medium', body: '', priority: 'medium', category: 'lifestyle' },
      ],
    }
    const plan = buildPlan([framework])
    expect(plan.lifestyle_adjustments[0].priority).toBe('high')
    expect(plan.lifestyle_adjustments[1].priority).toBe('medium')
    expect(plan.lifestyle_adjustments[2].priority).toBe('low')
  })
})

describe('applyTierGating', () => {
  it('returns full plan for premium users', () => {
    const plan = buildPlan([mockFramework])
    const gated = applyTierGating(plan, 'premium')
    expect(gated.supplement_suggestions).toHaveLength(1)
  })

  it('hides supplements for free users', () => {
    const plan = buildPlan([mockFramework])
    const gated = applyTierGating(plan, 'free')
    expect(gated.supplement_suggestions).toHaveLength(0)
  })

  it('limits free users to top 3 recommendations', () => {
    const plan = buildPlan([mockFramework])
    const gated = applyTierGating(plan, 'free')
    const total =
      gated.diet_adjustments.length +
      gated.lifestyle_adjustments.length +
      gated.mindset_recommendations.length
    expect(total).toBeLessThanOrEqual(3)
  })
})

describe('validateFrameworks', () => {
  it('passes validation for compliant frameworks', () => {
    const errors = validateFrameworks([mockFramework])
    expect(errors).toHaveLength(0)
  })

  it('fails when supplement is missing disclaimer', () => {
    const invalid: WellnessFramework = {
      ...mockFramework,
      supplement_suggestions: [
        { id: 'bad-supplement', title: 'No disclaimer', body: '...', priority: 'low', category: 'supplement' },
      ],
    }
    const errors = validateFrameworks([invalid])
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]).toContain('missing a disclaimer')
  })
})
