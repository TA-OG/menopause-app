import type {
  WellnessFramework,
  WellnessPlan,
  WellnessRecommendation,
  OnboardingAnswer,
  UserPreferences,
  TriggerCondition,
} from '@/types/database'

/**
 * Wellness Recommendation Engine
 *
 * Pure functions only — no side effects, no I/O, fully testable.
 * Replicates MMF's risk-engine.ts pattern adapted for wellness frameworks.
 *
 * Flow:
 *   onboarding answers + frameworks → matchFrameworks() → buildPlan()
 */

// ─── Condition matching ───────────────────────────────────────────────────────

function evaluateCondition(
  condition: TriggerCondition,
  answers: OnboardingAnswer[]
): boolean {
  const relevantAnswers = answers.filter(
    (a) => a.question_key === condition.question
  )

  if (relevantAnswers.length === 0) return false

  const targetAnswers = Array.isArray(condition.answer)
    ? condition.answer
    : [condition.answer]

  const matches = relevantAnswers.filter((a) =>
    targetAnswers.includes(a.answer_value)
  )

  const minMatches = condition.min_matches ?? 1
  return matches.length >= minMatches
}

function allConditionsMet(
  conditions: TriggerCondition[],
  answers: OnboardingAnswer[]
): boolean {
  if (conditions.length === 0) return false
  return conditions.every((condition) =>
    evaluateCondition(condition, answers)
  )
}

// ─── Framework matching ───────────────────────────────────────────────────────

export function matchFrameworks(
  answers: OnboardingAnswer[],
  frameworks: WellnessFramework[]
): WellnessFramework[] {
  return frameworks.filter((framework) =>
    allConditionsMet(framework.trigger_conditions, answers)
  )
}

// ─── Plan building ────────────────────────────────────────────────────────────

function deduplicateRecommendations(
  recs: WellnessRecommendation[]
): WellnessRecommendation[] {
  const seen = new Set<string>()
  return recs.filter((rec) => {
    if (seen.has(rec.id)) return false
    seen.add(rec.id)
    return true
  })
}

function sortByPriority(
  recs: WellnessRecommendation[]
): WellnessRecommendation[] {
  const order = { high: 0, medium: 1, low: 2 }
  return [...recs].sort(
    (a, b) => order[a.priority] - order[b.priority]
  )
}

function applyPreferenceFilters(
  recs: WellnessRecommendation[],
  preferences: Partial<UserPreferences>
): WellnessRecommendation[] {
  return recs.filter((rec) => {
    // Filter out supplement suggestions if user hasn't opted in
    // (for now we include all — Pamela's 'who_for' field handles targeting)
    return true
  })
}

export function buildPlan(
  matchedFrameworks: WellnessFramework[],
  preferences: Partial<UserPreferences> = {}
): Omit<WellnessPlan, 'id' | 'user_id' | 'generated_at' | 'is_active' | 'version' | 'created_at'> {
  const allDiet = matchedFrameworks.flatMap((f) => f.diet_adjustments)
  const allLifestyle = matchedFrameworks.flatMap((f) => f.lifestyle_adjustments)
  const allMindset = matchedFrameworks.flatMap((f) => f.mindset_recommendations)
  const allSupplements = matchedFrameworks.flatMap((f) => f.supplement_suggestions)
  const allContentIds = matchedFrameworks.flatMap((f) => f.content_module_ids)

  return {
    framework_ids: matchedFrameworks.map((f) => f.id),
    diet_adjustments: sortByPriority(
      applyPreferenceFilters(deduplicateRecommendations(allDiet), preferences)
    ),
    lifestyle_adjustments: sortByPriority(
      applyPreferenceFilters(deduplicateRecommendations(allLifestyle), preferences)
    ),
    mindset_recommendations: sortByPriority(
      applyPreferenceFilters(deduplicateRecommendations(allMindset), preferences)
    ),
    supplement_suggestions: sortByPriority(
      applyPreferenceFilters(deduplicateRecommendations(allSupplements), preferences)
    ),
  }
}

// ─── Tier gating — free users see top 3 recs only ────────────────────────────

export function applyTierGating(
  plan: Omit<WellnessPlan, 'id' | 'user_id' | 'generated_at' | 'is_active' | 'version' | 'created_at'>,
  tier: 'free' | 'premium'
) {
  if (tier === 'premium') return plan

  // Free users: top 3 across all categories combined by priority
  const allRecs = [
    ...plan.diet_adjustments,
    ...plan.lifestyle_adjustments,
    ...plan.mindset_recommendations,
  ]
  const top3 = sortByPriority(allRecs).slice(0, 3)

  return {
    ...plan,
    diet_adjustments: plan.diet_adjustments.filter((r) =>
      top3.some((t) => t.id === r.id)
    ),
    lifestyle_adjustments: plan.lifestyle_adjustments.filter((r) =>
      top3.some((t) => t.id === r.id)
    ),
    mindset_recommendations: plan.mindset_recommendations.filter((r) =>
      top3.some((t) => t.id === r.id)
    ),
    supplement_suggestions: [], // Supplements are premium only
  }
}

// ─── Validate supplement disclaimers (called by validate-content.ts) ─────────

export function validateFrameworks(frameworks: WellnessFramework[]): string[] {
  const errors: string[] = []

  for (const framework of frameworks) {
    for (const supplement of framework.supplement_suggestions) {
      if (!supplement.disclaimer || supplement.disclaimer.trim() === '') {
        errors.push(
          `[${framework.id}] Supplement "${supplement.id}" is missing a disclaimer. ` +
          `All supplements must include a GP check disclaimer.`
        )
      }
    }
  }

  return errors
}
