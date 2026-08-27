import type {
  WellnessFramework,
  WellnessPlan,
  WellnessRecommendation,
  OnboardingAnswer,
  UserPreferences,
  TriggerCondition,
  SubstanceEntry,
  UserSignals,
  PersonalNote,
} from '@/types/database'
import { signalsToAnswers } from './user-signals'
import { circumstancesFor, labelFor, noteKindFor } from './medical-flags'

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

// ─── Signal-driven relevance and ranking ──────────────────────────────────────

/**
 * Does this recommendation speak directly to something she told us?
 *
 * OR semantics across conditions — see the `relevant_when` doc comment in
 * types/database.ts. Deliberately different from `trigger_conditions`, which
 * are AND. Relevance is "any of these apply to you"; triggering is "your whole
 * situation matches this framework".
 *
 * Evaluated with the SAME `evaluateCondition` used for framework triggers, so a
 * condition an author writes behaves identically wherever they write it.
 */
function isDirectlyRelevant(
  rec: WellnessRecommendation,
  answers: OnboardingAnswer[]
): boolean {
  const conditions = rec.relevant_when ?? []
  if (conditions.length === 0) return false
  return conditions.some((condition) => evaluateCondition(condition, answers))
}

/**
 * Goals, in her words, mapped to the symptoms they're about.
 *
 * This is a UX mapping of the user's OWN stated goal onto the vocabulary the
 * content already uses — not a clinical inference. Keys are the exact
 * `answer_value`s from GOAL_CHOICES in onboarding-config.ts;
 * `onboarding-influence.test.ts` fails the build if they drift apart.
 *
 * 'Understand my body better' and 'All of the above' map to nothing on purpose:
 * neither singles out a symptom, so neither should quietly re-rank her plan.
 */
const GOAL_TO_SYMPTOMS: Record<string, string[]> = {
  'Improve sleep': ['sleep_problems', 'fatigue'],
  'Manage mood and stress': ['mood_changes', 'anxiety', 'brain_fog'],
  'Manage weight': ['weight_changes'],
  'Boost energy': ['fatigue'],
  'Improve relationships and intimacy': ['low_libido', 'vaginal_dryness'],
  'Reduce physical symptoms': ['hot_flashes', 'night_sweats', 'joint_pain'],
}

/**
 * `previously_tried` answers mapped onto recommendation categories.
 *
 * READ THE CAVEAT. The question asks "Have you tried anything to manage your
 * symptoms?" — it does NOT ask whether it helped. The step's own subtitle
 * promises "we won't repeat what hasn't worked", which the answer cannot
 * actually establish: she may have tried diet changes and be doing well on them.
 *
 * So this applies a SMALL nudge (see PENALTY_PREVIOUSLY_TRIED) that lets
 * approaches she hasn't explored surface first, and nothing stronger. It never
 * removes anything. Turning this into a real signal needs a follow-up question
 * ("did it help?"), which is a product change, not an engine one.
 */
const TRIED_TO_CATEGORY: Record<string, WellnessRecommendation['category']> = {
  'Diet changes': 'diet',
  Exercise: 'lifestyle',
  'Natural supplements': 'supplement',
  'Mindfulness / meditation': 'mindset',
}

/**
 * Scoring weights. Exported so tests can assert on intent rather than on magic
 * numbers, and so the ordering of a plan is explainable to the woman reading it.
 *
 * TIER CROSSING IS INTENDED, UPWARDS.
 * Authored priority is the largest single term, but the positive bonuses can
 * sum past the 100-point gap between tiers (see MAX_POSITIVE_BONUS below), and
 * that is the point: a 'medium' card that targets her primary symptom, matches
 * her stated goal and speaks to her caffeine intake SHOULD outrank a 'high'
 * card that applies to nobody in her situation. The smoking-cessation card is
 * the clearest case — authored `high` because smoking is the single biggest
 * cardiovascular risk, and it earns DIRECTLY_RELEVANT for a smoker while
 * correctly sinking for the ~80% of users who have never smoked.
 *
 * CAUTIONS CROSS DOWNWARDS, ABSOLUTELY.
 * CAUTION_DECLARED is set so that a cautioned card can never outrank ANY
 * uncautioned one, whatever else it has going for it. That guarantee is
 * asserted in wellness-engine.safety.test.ts rather than left to inspection.
 */
export const SCORE_WEIGHTS = {
  PRIORITY_HIGH: 300,
  PRIORITY_MEDIUM: 200,
  PRIORITY_LOW: 100,
  /** Card targets the symptom she said bothers her most. */
  PRIMARY_SYMPTOM: 60,
  /** Per additional symptom of hers the card targets. */
  SYMPTOM_OVERLAP: 12,
  /** Cap on stacked symptom-overlap bonus, so a broad card can't run away. */
  SYMPTOM_OVERLAP_CAP: 36,
  /** An authored `relevant_when` condition matched her answers. */
  DIRECTLY_RELEVANT: 45,
  /**
   * The card declares when it is relevant — and none of it applies to her.
   *
   * The symmetric half of DIRECTLY_RELEVANT, and it matters as much. Boosting
   * alone leaves "Caffeine raises cortisol — limit to 1–2 cups before noon"
   * leading the plan of a woman who told us she drinks one cup a day, because
   * the card still wins on symptom match. An author who writes `relevant_when`
   * has stated the conditions under which the card earns attention; when none
   * hold, it has demonstrably less claim on hers.
   *
   * Applies ONLY to cards that declare `relevant_when`. An untagged card is
   * untouched — silence from an author means "no view", never "irrelevant",
   * so the 122 cards with no tag are not quietly demoted beneath the 44 tagged
   * ones.
   *
   * Deliberately modest, and never removal: paired with DIRECTLY_RELEVANT it
   * makes an ~85-point swing between "this is about you" and "this isn't",
   * which reorders within a priority tier without burying content.
   */
  NOT_RELEVANT: -40,
  /** Severe/moderate primary symptom, on a card that targets her symptoms. */
  SEVERITY_SEVERE: 25,
  SEVERITY_MODERATE: 12,
  /** Card is about a symptom named by her stated goal. */
  GOAL_ALIGNED: 30,
  /** Diet cards, for someone who told us diet is her weak point. */
  DIET_GAP: 20,
  /** Diet cards, for someone already eating mostly whole foods. */
  PENALTY_DIET_COVERED: -15,
  /** Poor sleep, on a card targeting sleep. */
  SLEEP_NEED: 25,
  /** High stress, on a card targeting anxiety or mood. */
  STRESS_NEED: 20,
  /** She's already explored this category — see TRIED_TO_CATEGORY caveat. */
  PENALTY_PREVIOUSLY_TRIED: -25,
  /**
   * A circumstance she declared is cautioned about on this card.
   *
   * MUST dominate every other term combined. The guarantee it buys is:
   *
   *     a cautioned card never outranks an uncautioned one — ever
   *
   * For that, |CAUTION_DECLARED| must exceed the full spread of achievable
   * uncautioned scores, i.e. (PRIORITY_HIGH + MAX_POSITIVE_BONUS) −
   * PRIORITY_LOW = (300 + 261) − 100 = 461. A merely "large" −250 would NOT
   * do it: a high-priority, highly-relevant cautioned supplement would score
   * 300 + 261 − 250 = 311 and still sit above an uncautioned high card on 300.
   * −1000 clears the bound with room for future weights, and is checked by
   * `SCORE_WEIGHTS` invariants rather than trusted.
   *
   * It de-ranks; it never removes. The card stays present, readable, and
   * carrying its caution — see medical-flags.ts for why suppression is the
   * more dangerous option here.
   */
  CAUTION_DECLARED: -1000,
} as const

/**
 * The largest bonus any single recommendation can accumulate, if every positive
 * signal fires at once. Derived, not typed in, so it cannot fall out of date
 * when a weight is added or changed.
 */
export const MAX_POSITIVE_BONUS =
  SCORE_WEIGHTS.PRIMARY_SYMPTOM +
  SCORE_WEIGHTS.SYMPTOM_OVERLAP_CAP +
  SCORE_WEIGHTS.DIRECTLY_RELEVANT +
  SCORE_WEIGHTS.SEVERITY_SEVERE +
  SCORE_WEIGHTS.GOAL_ALIGNED +
  SCORE_WEIGHTS.SLEEP_NEED +
  SCORE_WEIGHTS.STRESS_NEED +
  SCORE_WEIGHTS.DIET_GAP

/**
 * The largest penalty an UNCAUTIONED recommendation can accumulate — every
 * non-caution penalty at once (declared-but-irrelevant, already-explored, and
 * a diet card for someone already eating well; DIRECTLY_RELEVANT and
 * NOT_RELEVANT are mutually exclusive, so only the latter counts here).
 *
 * Needed because it sets the FLOOR of the uncautioned range, and the caution
 * guarantee is about the whole range, not just the top of it.
 */
export const MAX_NEGATIVE_PENALTY =
  SCORE_WEIGHTS.NOT_RELEVANT +
  SCORE_WEIGHTS.PENALTY_PREVIOUSLY_TRIED +
  SCORE_WEIGHTS.PENALTY_DIET_COVERED

/**
 * The full spread of scores an uncautioned recommendation can occupy:
 * best case (high priority, every bonus) minus worst case (low priority, every
 * penalty). `|CAUTION_DECLARED|` must exceed this, or a cautioned card could
 * still outrank an uncautioned one. Asserted in wellness-engine.safety.test.ts.
 */
export const UNCAUTIONED_SCORE_SPREAD =
  SCORE_WEIGHTS.PRIORITY_HIGH +
  MAX_POSITIVE_BONUS -
  (SCORE_WEIGHTS.PRIORITY_LOW + MAX_NEGATIVE_PENALTY)

/**
 * Score a recommendation against everything she told us.
 *
 * Pure and deterministic: same recommendation + same signals ⇒ same score,
 * always. That matters because "why is this at the top of my plan?" has to have
 * a stable answer.
 */
export function scoreRecommendation(
  rec: WellnessRecommendation,
  signals: UserSignals,
  answers: OnboardingAnswer[] = signalsToAnswers(signals)
): number {
  const W = SCORE_WEIGHTS
  let score =
    rec.priority === 'high'
      ? W.PRIORITY_HIGH
      : rec.priority === 'medium'
        ? W.PRIORITY_MEDIUM
        : W.PRIORITY_LOW

  const targets = rec.targets_symptoms ?? []
  const hers = new Set(signals.symptoms)

  // ── What she came here for ────────────────────────────────────────────────
  if (signals.primary_symptom && targets.includes(signals.primary_symptom)) {
    score += W.PRIMARY_SYMPTOM
  }

  const overlap = targets.filter(
    (s) => hers.has(s) && s !== signals.primary_symptom
  ).length
  score += Math.min(overlap * W.SYMPTOM_OVERLAP, W.SYMPTOM_OVERLAP_CAP)

  // ── How much it's affecting her ───────────────────────────────────────────
  const touchesHerSymptoms = targets.some((s) => hers.has(s))
  if (touchesHerSymptoms) {
    if (signals.symptom_severity === 'severe') score += W.SEVERITY_SEVERE
    else if (signals.symptom_severity === 'moderate') score += W.SEVERITY_MODERATE
  }

  // ── What she said she wants ───────────────────────────────────────────────
  const goalSymptoms = signals.primary_goal
    ? (GOAL_TO_SYMPTOMS[signals.primary_goal] ?? [])
    : []
  if (goalSymptoms.some((s) => targets.includes(s))) score += W.GOAL_ALIGNED

  // ── Her day-to-day: authored relevance conditions ─────────────────────────
  // This is how caffeine_intake, alcohol_intake, smoking_status, diet_type,
  // exercise_level, sleep_quality, stress_level, age_range and medical_flags
  // reach the ranking — content declares when it matters, in both directions.
  // A card with no `relevant_when` is left alone: no author view, no adjustment.
  if ((rec.relevant_when?.length ?? 0) > 0) {
    score += isDirectlyRelevant(rec, answers)
      ? W.DIRECTLY_RELEVANT
      : W.NOT_RELEVANT
  }

  // ── Lifestyle needs the content already targets by symptom ────────────────
  if (
    (signals.sleep_quality === 'poor' || signals.sleep_quality === 'very_poor') &&
    targets.includes('sleep_problems')
  ) {
    score += W.SLEEP_NEED
  }
  if (
    (signals.stress_level === 'high' || signals.stress_level === 'very_high') &&
    (targets.includes('anxiety') || targets.includes('mood_changes'))
  ) {
    score += W.STRESS_NEED
  }

  // ── Where her biggest gap is ──────────────────────────────────────────────
  if (rec.category === 'diet') {
    if (signals.diet_type === 'convenience' || signals.diet_type === 'unaware') {
      score += W.DIET_GAP
    } else if (signals.diet_type === 'whole_foods') {
      score += W.PENALTY_DIET_COVERED
    }
  }

  // ── What she's already explored (small nudge only — see caveat above) ─────
  const triedCategories = new Set(
    signals.previously_tried
      .map((t) => TRIED_TO_CATEGORY[t])
      .filter((c): c is WellnessRecommendation['category'] => Boolean(c))
  )
  if (triedCategories.has(rec.category)) score += W.PENALTY_PREVIOUSLY_TRIED

  // ── Anything she declared that this card cautions about ───────────────────
  const declared = new Set([...signals.medical_flags, ...signals.diet_restrictions])
  const applicable = circumstancesFor(rec).filter((c) => declared.has(c))
  if (applicable.length > 0) score += W.CAUTION_DECLARED

  return score
}

/**
 * Attach "this applies to you" context drawn from her own answers.
 *
 * The note repeats the card's existing caution in her terms; it never asserts
 * anything the card does not already say. `personal_note` is rendered ABOVE any
 * "read more" boundary, alongside `disclaimer` and `max_daily_note` — a caution
 * that collapses is a caution that doesn't exist.
 *
 * EXPORTED because it must also run at RENDER time, not only when the plan is
 * generated. A plan is stored in `wellness_plans` at intake and then read back
 * for months. If a woman starts anticoagulants — or is prescribed them between
 * one plan and the next — the cautions on her stored plan would still reflect
 * the flags she declared long ago. Re-attaching from her CURRENT answers keeps
 * the safety layer live while leaving the plan's content and order as the
 * record of what she was actually given.
 *
 * Cheap enough to do on every page view: pure, no I/O, and it only pattern-
 * matches text already in memory.
 */
export function attachPersonalNotes(
  recs: WellnessRecommendation[],
  signals: UserSignals
): WellnessRecommendation[] {
  const declared = new Set([...signals.medical_flags, ...signals.diet_restrictions])
  if (declared.size === 0) return recs

  return recs.map((rec) => {
    const applicable = circumstancesFor(rec).filter((c) => declared.has(c))
    if (applicable.length === 0) return rec

    const labels = applicable
      .map((value) => labelFor(value))
      .filter((l): l is string => Boolean(l))
    if (labels.length === 0) return rec

    // 'caution' wins when both kinds apply — it is the more serious of the two.
    const kind: PersonalNote['kind'] = applicable.some(
      (c) => noteKindFor(c) === 'caution'
    )
      ? 'caution'
      : 'adapt'

    const because = labels.join(', and ')
    const text =
      kind === 'caution'
        ? `You told us ${because}. This one carries a caution that applies to you — ` +
          `read it below and check with your GP or pharmacist before starting.`
        : `You told us ${because}. This one needs checking or adapting — ` +
          `see the note below before you buy anything.`

    return { ...rec, personal_note: { kind, because: applicable, text } }
  })
}

// ─── Plan building ────────────────────────────────────────────────────────────

/**
 * Rank a processed category by everything the user told us, and attach her
 * personal notes.
 *
 * Runs LAST, on the already-filtered, already-deduplicated, already-priority-
 * sorted list. Ordering matters:
 *
 *   - after dedupe, so a substance is scored once, on the surviving card
 *     (scoring before dedupe could pick a different winner and quietly undo
 *     the dose-stacking guarantee)
 *   - after sortByPriority, so its deterministic tie-break survives as the
 *     baseline order that equal scores fall back to
 *
 * `Array.prototype.sort` is stable in every engine this runs on (required by
 * spec since ES2019), so recommendations with equal scores keep exactly the
 * order sortByPriority gave them. That is what preserves the primary-symptom
 * tie-break the regression test in wellness-engine.test.ts guards.
 */
function rankBySignals(
  recs: WellnessRecommendation[],
  signals: UserSignals,
  answers: OnboardingAnswer[]
): WellnessRecommendation[] {
  const scored = attachPersonalNotes(recs, signals)
  return [...scored].sort(
    (a, b) =>
      scoreRecommendation(b, signals, answers) -
      scoreRecommendation(a, signals, answers)
  )
}

/**
 * Build a personalised wellness plan from matched frameworks.
 *
 * @param matchedFrameworks  Frameworks that fired for this user
 * @param preferences        User lifestyle preferences (for filtering)
 * @param primarySymptom     User's declared #1 symptom (for priority boost)
 * @param substances         Substance registry (dedupe + dose ceilings)
 * @param signals            Everything else she told us at intake. OPTIONAL, and
 *                           omitting it reproduces the previous behaviour
 *                           exactly — no scoring pass, no personal notes. That
 *                           keeps every existing caller and test valid while the
 *                           signal-aware path is adopted; /api/wellness-plan
 *                           passes it.
 */
export function buildPlan(
  matchedFrameworks: WellnessFramework[],
  preferences: Partial<UserPreferences> = {},
  primarySymptom?: string,
  substances: SubstanceEntry[] = [],
  signals?: UserSignals
): Omit<WellnessPlan, 'id' | 'user_id' | 'generated_at' | 'is_active' | 'version' | 'created_at'> {
  const allDiet        = matchedFrameworks.flatMap((f) => f.diet_adjustments)
  const allLifestyle   = matchedFrameworks.flatMap((f) => f.lifestyle_adjustments)
  const allMindset     = matchedFrameworks.flatMap((f) => f.mindset_recommendations)
  const allSupplements = matchedFrameworks.flatMap((f) => f.supplement_suggestions)

  const substanceIndex = buildSubstanceIndex(substances)

  // Derived once, not per recommendation — signalsToAnswers() is pure but
  // rebuilding it inside a comparator would run it O(n log n) times.
  const signalAnswers = signals ? signalsToAnswers(signals) : []

  function processList(recs: WellnessRecommendation[]) {
    const processed = enforceDoseCeilings(
      sortByPriority(
        boostForPrimarySymptom(
          // Preference filtering MUST run before deduplication. Dedup keeps the
          // highest-priority card for a substance and discards its siblings — so
          // if that winner is `active_only` and the user has limited mobility,
          // filtering afterwards would remove the whole substance, including a
          // sibling card she was eligible for. Filtering first means dedup only
          // ever chooses between cards she can actually use.
          deduplicateRecommendations(
            applyPreferenceFilters(recs, preferences),
            substanceIndex
          ),
          primarySymptom
        ),
        primarySymptom,
      ),
      substanceIndex,
    )

    return signals ? rankBySignals(processed, signals, signalAnswers) : processed
  }

  return {
    framework_ids:          matchedFrameworks.map((f) => f.id),
    diet_adjustments:       processList(allDiet),
    lifestyle_adjustments:  processList(allLifestyle),
    mindset_recommendations: processList(allMindset),
    supplement_suggestions: processList(allSupplements),
  }
}

// ─── Focus selection — the small, cross-category set that leads her plan ─────

/** The four category arrays of a built plan. */
type PlanCategories = Pick<
  WellnessPlan,
  | 'diet_adjustments'
  | 'lifestyle_adjustments'
  | 'mindset_recommendations'
  | 'supplement_suggestions'
>

/**
 * The handful of recommendations that should lead her plan, chosen across all
 * four categories at once.
 *
 * WHY THIS HAS TO BE CROSS-CATEGORY
 * A plan is stored as four separate arrays. Ranking *within* an array means any
 * signal that moves every card in a category by the same amount changes
 * nothing — "you eat mostly convenience food, so diet matters more for you"
 * lifts all 34 diet cards equally and reorders none of them. Judged only
 * per-category, `diet_type` and `previously_tried` would be no-ops dressed up
 * as personalisation. Comparing across categories is what lets them count.
 *
 * Not stored on `wellness_plans` — derived at render time from the plan and her
 * signals, so it needs no migration and stays correct if her answers change.
 *
 * Supplements are eligible. That is safe because a supplement carrying a
 * caution she has declared scores below every uncautioned card (see
 * CAUTION_DECLARED), so it cannot lead her plan — while still appearing, with
 * its caution, in the supplements tab.
 */
export function selectFocus(
  plan: PlanCategories,
  signals: UserSignals,
  limit = 3
): WellnessRecommendation[] {
  const answers = signalsToAnswers(signals)
  const all = [
    ...plan.diet_adjustments,
    ...plan.lifestyle_adjustments,
    ...plan.mindset_recommendations,
    ...plan.supplement_suggestions,
  ]

  // Stable sort: equal scores keep the order buildPlan produced.
  return [...all]
    .sort(
      (a, b) =>
        scoreRecommendation(b, signals, answers) -
        scoreRecommendation(a, signals, answers)
    )
    .slice(0, Math.max(0, limit))
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
