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
 *
 * Flow:
 *   onboarding answers + frameworks → matchFrameworks()
 *                                   → buildPlan(matchedFrameworks, preferences, primarySymptom)
 *
 * Framework matching supports:
 *   - trigger_all: true  → fires for every user (universal foundations)
 *   - trigger_conditions → AND-logic: all conditions must match
 *   - min_matches        → OR-logic within a condition (default: 1)
 *
 * Plan building supports:
 *   - Deduplication by recommendation ID
 *   - Priority sorting (high → medium → low)
 *   - Preference filtering (e.g. hide active_only recs for limited mobility)
 *   - Primary symptom boost (raises priority of directly-targeted recs)
 *   - Tier gating (free users: top 3 combined; supplements: premium only)
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
  return frameworks.filter((framework) => {
    // Universal frameworks fire for every user
    if (framework.trigger_all === true) return true
    return allConditionsMet(framework.trigger_conditions, answers)
  })
}

// ─── Preference-based filtering ───────────────────────────────────────────────

/**
 * Remove recommendations that are inappropriate for the user's current
 * lifestyle capacity. This is intentionally conservative — we only filter
 * when we have a strong signal (e.g. self-declared exercise limitation).
 */
function applyPreferenceFilters(
  recs: WellnessRecommendation[],
  preferences: Partial<UserPreferences>
): WellnessRecommendation[] {
  return recs.filter((rec) => {
    const forWhom = rec.who_for ?? 'all'

    // Users with exercise limitations should not see high-intensity recs
    if (
      forWhom === 'active_only' &&
      (preferences.exercise_level === 'limited' ||
        preferences.exercise_level === 'not_active')
    ) {
      return false
    }

    return true
  })
}

// ─── Primary symptom boost ────────────────────────────────────────────────────

/**
 * If a recommendation explicitly targets the user's declared primary symptom,
 * elevate it to 'high' priority so it appears first in its category.
 * This ensures the plan leads with what the user cares about most.
 */
function boostForPrimarySymptom(
  recs: WellnessRecommendation[],
  primarySymptom?: string
): WellnessRecommendation[] {
  if (!primarySymptom) return recs

  return recs.map((rec) => {
    const targets = rec.targets_symptoms ?? []
    if (targets.includes(primarySymptom) && rec.priority !== 'high') {
      return { ...rec, priority: 'high' as const }
    }
    return rec
  })
}

// ─── Deduplication & sorting ──────────────────────────────────────────────────

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

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 }

function sortByPriority(
  recs: WellnessRecommendation[]
): WellnessRecommendation[] {
  return [...recs].sort(
    (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
  )
}

// ─── Plan building ────────────────────────────────────────────────────────────

/**
 * Build a personalised wellness plan from matched frameworks.
 *
 * @param matchedFrameworks  Frameworks that fired for this user
 * @param preferences        User lifestyle preferences (for filtering)
 * @param primarySymptom     User's declared #1 symptom (for priority boost)
 */
export function buildPlan(
  matchedFrameworks: WellnessFramework[],
  preferences: Partial<UserPreferences> = {},
  primarySymptom?: string
): Omit<WellnessPlan, 'id' | 'user_id' | 'generated_at' | 'is_active' | 'version' | 'created_at'> {
  const allDiet        = matchedFrameworks.flatMap((f) => f.diet_adjustments)
  const allLifestyle   = matchedFrameworks.flatMap((f) => f.lifestyle_adjustments)
  const allMindset     = matchedFrameworks.flatMap((f) => f.mindset_recommendations)
  const allSupplements = matchedFrameworks.flatMap((f) => f.supplement_suggestions)

  function processList(recs: WellnessRecommendation[]) {
    return sortByPriority(
      boostForPrimarySymptom(
        applyPreferenceFilters(
          deduplicateRecommendations(recs),
          preferences
        ),
        primarySymptom
      )
    )
  }

  return {
    framework_ids:          matchedFrameworks.map((f) => f.id),
    diet_adjustments:       processList(allDiet),
    lifestyle_adjustments:  processList(allLifestyle),
    mindset_recommendations: processList(allMindset),
    supplement_suggestions: processList(allSupplements),
  }
}

// ─── Tier gating — free users see top 3 recs only ────────────────────────────

export function applyTierGating(
  plan: Omit<WellnessPlan, 'id' | 'user_id' | 'generated_at' | 'is_active' | 'version' | 'created_at'>,
  tier: 'free' | 'premium'
) {
  if (tier === 'premium') return plan

  // Free: top 3 non-supplement recommendations combined by priority
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
    supplement_suggestions: [], // Supplements: premium only
  }
}

// ─── Framework validation (called by validate-content script) ─────────────────

export function validateFrameworks(frameworks: WellnessFramework[]): string[] {
  const errors: string[] = []

  for (const framework of frameworks) {
    // Every framework must have a unique id
    if (!framework.id) {
      errors.push(`A framework is missing an id`)
      continue
    }

    for (const supplement of framework.supplement_suggestions) {
      if (!supplement.disclaimer || supplement.disclaimer.trim() === '') {
        errors.push(
          `[${framework.id}] Supplement "${supplement.id}" is missing a disclaimer. ` +
          `All supplements must include a GP check disclaimer.`
        )
      }
    }

    // Warn if a framework has no recommendations at all
    const totalRecs =
      framework.diet_adjustments.length +
      framework.lifestyle_adjustments.length +
      framework.mindset_recommendations.length +
      framework.supplement_suggestions.length
    if (totalRecs === 0) {
      errors.push(
        `[${framework.id}] Framework has no recommendations — will generate an empty plan section.`
      )
    }
  }

  return errors
}
