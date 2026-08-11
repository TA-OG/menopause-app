import type {
  WellnessFramework,
  WellnessPlan,
  WellnessRecommendation,
  OnboardingAnswer,
  UserPreferences,
  TriggerCondition,
  SubstanceEntry,
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

/**
 * Build a lookup of recommendation ID → substance entry, from a registry that
 * the caller has already loaded. Pure, so the engine keeps doing no I/O.
 */
export function buildSubstanceIndex(
  substances: SubstanceEntry[]
): Map<string, SubstanceEntry> {
  const index = new Map<string, SubstanceEntry>()
  for (const substance of substances) {
    for (const recId of substance.recommendation_ids ?? []) {
      index.set(recId, substance)
    }
  }
  return index
}

/**
 * Human-readable cumulative ceiling for a substance, or null when no limit has
 * been verified. Returns null rather than guessing — an invented ceiling in a
 * health app is worse than no ceiling, because it looks authoritative.
 */
export function formatMaxDailyNote(substance: SubstanceEntry): string | null {
  if (substance.limit_status !== 'verified' || !substance.max_daily) return null

  const { amount, unit, basis } = substance.max_daily
  return (
    `Maximum ${amount}${unit} per day in total (${basis}) — this is the combined ` +
    `ceiling across everything in your plan, not per suggestion. ` +
    `Check with your GP or pharmacist before going near it.`
  )
}

/**
 * Collapse recommendations that refer to the same underlying substance.
 *
 * SAFETY-CRITICAL. A user can match many frameworks at once — `foundations`
 * fires for everyone, and the symptom frameworks fire off an independent
 * multi-select checkbox. Deduplicating by `rec.id` alone (which is what this
 * did originally) let five different frameworks each contribute their own
 * omega-3 card, with upper bounds that read as additive: 2000 + 3000 + 3000 +
 * 3000mg plus one unspecified. Nothing told the user those were the same
 * substance.
 *
 * Grouping is driven by content/wellness/substances.yaml — an explicit,
 * hand-authored mapping. It is deliberately NOT fuzzy title matching: calcium
 * and calcium D-glucarate, and collagen Type I and Type II, are different
 * substances that must never be merged.
 *
 * Recommendations with no registry entry fall back to ID-level dedupe, which
 * is the previous behaviour — never worse than before.
 */
function deduplicateRecommendations(
  recs: WellnessRecommendation[],
  substanceIndex: Map<string, SubstanceEntry> = new Map()
): WellnessRecommendation[] {
  const seenIds = new Set<string>()
  const groups = new Map<string, WellnessRecommendation[]>()
  const order: string[] = []

  for (const rec of recs) {
    // Exact-duplicate IDs collapse first (the original behaviour)
    if (seenIds.has(rec.id)) continue
    seenIds.add(rec.id)

    const substance = substanceIndex.get(rec.id)
    const groupKey = substance ? `substance:${substance.key}` : `id:${rec.id}`

    if (!groups.has(groupKey)) {
      groups.set(groupKey, [])
      order.push(groupKey)
    }
    groups.get(groupKey)!.push(rec)
  }

  return order.map((groupKey) => {
    const group = groups.get(groupKey)!
    if (group.length === 1) return group[0]

    // Several frameworks contributed a card for one substance. Keep the
    // highest-priority card as the base; first occurrence wins a tie.
    const [base, ...collapsed] = [...group].sort(
      (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    )

    const mergedSymptoms = Array.from(
      new Set(group.flatMap((rec) => rec.targets_symptoms ?? []))
    )

    return {
      ...base,
      targets_symptoms: mergedSymptoms.length > 0 ? mergedSymptoms : undefined,
      // Record what was collapsed so the symptom-specific framing isn't simply
      // lost. Polished per-symptom copy is a separate content task; this keeps
      // a faithful record in the meantime.
      also_for: collapsed.map((rec) => rec.title),
    }
  })
}

/**
 * Attach the single cumulative ceiling for each substance, where one has been
 * verified against a named authority.
 *
 * This runs on the FINAL list, after deduplication, unconditionally — it does
 * not depend on which frameworks fired or on anything the client sent. That
 * matters because /api/onboarding does not currently validate answer values
 * against an allowlist, so framework matching cannot be treated as trusted
 * input. Substances with `limit_status: needs_clinical_review` get no numeric
 * ceiling: we do not invent one. They remain protected structurally, because
 * deduplication guarantees they can appear at most once.
 */
function enforceDoseCeilings(
  recs: WellnessRecommendation[],
  substanceIndex: Map<string, SubstanceEntry>
): WellnessRecommendation[] {
  return recs.map((rec) => {
    const substance = substanceIndex.get(rec.id)
    if (!substance) return rec

    const note = formatMaxDailyNote(substance)
    if (!note) return rec

    return { ...rec, max_daily_note: note }
  })
}

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 }

/**
 * Sort by priority tier (high → medium → low), then — within a tier — by
 * whether the recommendation targets the user's primary symptom.
 *
 * Without the second key, ties fall back to Array.sort's stable order, which
 * is just "framework array order" (effectively alphabetical by YAML
 * filename). That silently let e.g. bone-cardiovascular.yaml's diet items
 * dominate the free-tier "top 3" teaser regardless of what the user actually
 * said bothered them most, making boostForPrimarySymptom's priority bump
 * largely ineffective for anyone whose primary symptom wasn't in an
 * alphabetically-early framework.
 */
function sortByPriority(
  recs: WellnessRecommendation[],
  primarySymptom?: string
): WellnessRecommendation[] {
  return [...recs].sort((a, b) => {
    const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    if (priorityDiff !== 0) return priorityDiff
    if (!primarySymptom) return 0

    const aTargets = a.targets_symptoms?.includes(primarySymptom) ? 0 : 1
    const bTargets = b.targets_symptoms?.includes(primarySymptom) ? 0 : 1
    return aTargets - bTargets
  })
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
  primarySymptom?: string,
  substances: SubstanceEntry[] = []
): Omit<WellnessPlan, 'id' | 'user_id' | 'generated_at' | 'is_active' | 'version' | 'created_at'> {
  const allDiet        = matchedFrameworks.flatMap((f) => f.diet_adjustments)
  const allLifestyle   = matchedFrameworks.flatMap((f) => f.lifestyle_adjustments)
  const allMindset     = matchedFrameworks.flatMap((f) => f.mindset_recommendations)
  const allSupplements = matchedFrameworks.flatMap((f) => f.supplement_suggestions)

  const substanceIndex = buildSubstanceIndex(substances)

  function processList(recs: WellnessRecommendation[]) {
    return enforceDoseCeilings(
      sortByPriority(
        boostForPrimarySymptom(
          applyPreferenceFilters(
            deduplicateRecommendations(recs, substanceIndex),
            preferences
          ),
          primarySymptom
        ),
        primarySymptom,
      ),
      substanceIndex,
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
