/**
 * ─────────────────────────────────────────────────────────────────────────────
 * FOCUS PROGRAMME — one change a week, chosen for what she wants to tackle
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A full plan is delivered all at once. This picks ONE change for the week,
 * for the 1–3 symptoms she chose to tackle first, and governs how weeks move
 * on. Design and the decisions behind every rule here: docs/focus-programme.md.
 *
 * Pure functions only, no I/O — same contract as wellness-engine.ts.
 *
 * WHAT THIS NEVER DOES
 *   - Pick a supplement. Supplements never lead a week (decision 4).
 *   - Pick a card carrying a caution or adaptation for something she declared.
 *     Those stay in her full plan, with their note; they just never lead.
 *   - Write or rewrite any health copy. It selects authored cards, verbatim.
 */

import type {
  FocusWeek,
  FocusWeekSnapshot,
  SymptomKey,
  UserSignals,
  WellnessPlan,
  WellnessRecommendation,
} from '@/types/database'
import { scoreRecommendation } from './wellness-engine'
import { circumstancesFor } from './medical-flags'
import { signalsToAnswers } from './user-signals'
import { SYMPTOM_KEYS, parseLocalCalendarDate } from './checkin-schema'
import { SYMPTOM_CHOICES } from './onboarding-config'

// ─── Agreed limits ────────────────────────────────────────────────────────────
// Mirrored by CHECK constraints in 036_focus_programmes.sql. A test asserts the
// numbers here, so changing one without the other is a deliberate act.

export const FOCUS_SYMPTOMS_MIN = 1
export const FOCUS_SYMPTOMS_MAX = 3
/** Most changes she is asked about on one daily check-in (decision 6). */
export const MAX_CHANGES_ON_CHECKIN = 3
/** A week can be reviewed from this many days after it started (decision 7). */
export const REVIEW_AFTER_DAYS = 7
/** Other changes offered beside the pick, so the choice stays hers. */
export const ALTERNATIVES_COUNT = 2

type PlanCategories = Pick<
  WellnessPlan,
  | 'diet_adjustments'
  | 'lifestyle_adjustments'
  | 'mindset_recommendations'
  | 'supplement_suggestions'
>

// ─── Choosing focus symptoms ──────────────────────────────────────────────────

const VALID_FOCUS = new Set<string>(SYMPTOM_KEYS.filter((k) => k !== 'other'))

/** Intake order, so the picker lists symptoms the way intake did. */
const INTAKE_ORDER = new Map(SYMPTOM_CHOICES.map((c, i) => [c.value, i]))

/**
 * The symptoms she may choose from: only those she declared at intake, her
 * "bothers me most" symptom first, the rest in intake order.
 */
export function focusSymptomOptions(signals: UserSignals): SymptomKey[] {
  const declared = Array.from(new Set(signals.symptoms)).filter((s) =>
    VALID_FOCUS.has(s)
  ) as SymptomKey[]

  return declared.sort((a, b) => {
    if (a === signals.primary_symptom) return -1
    if (b === signals.primary_symptom) return 1
    return (INTAKE_ORDER.get(a) ?? Infinity) - (INTAKE_ORDER.get(b) ?? Infinity)
  })
}

export type FocusSymptomsResult =
  | { ok: true; symptoms: SymptomKey[] }
  | { ok: false; error: string }

/**
 * Validate what she picked. Duplicates are collapsed; anything she did not
 * declare at intake is refused rather than silently dropped, because a request
 * containing one is a client bug or tampering, not a choice she made.
 */
export function normaliseFocusSymptoms(
  chosen: string[],
  signals: UserSignals
): FocusSymptomsResult {
  const options = new Set<string>(focusSymptomOptions(signals))
  const unique = Array.from(new Set(chosen))

  const notOffered = unique.filter((s) => !options.has(s))
  if (notOffered.length > 0) {
    return { ok: false, error: `Not one of your symptoms: ${notOffered.join(', ')}` }
  }
  if (unique.length < FOCUS_SYMPTOMS_MIN || unique.length > FOCUS_SYMPTOMS_MAX) {
    return {
      ok: false,
      error: `Choose between ${FOCUS_SYMPTOMS_MIN} and ${FOCUS_SYMPTOMS_MAX} symptoms`,
    }
  }
  return { ok: true, symptoms: unique as SymptomKey[] }
}

// ─── Choosing the week's change ───────────────────────────────────────────────

export interface WeeklyChangeCandidate {
  rec: WellnessRecommendation
  /** Which of her focus symptoms the card is tagged for, in her focus order. */
  covers: SymptomKey[]
}

export interface WeeklyChangeSelection {
  /** null when no eligible card is tagged for any of her focus symptoms. */
  pick: WeeklyChangeCandidate | null
  /** Up to ALTERNATIVES_COUNT runners-up she can choose instead. */
  alternatives: WeeklyChangeCandidate[]
  /** The pick covers some, not all, of her focus symptoms (decision 10). */
  closestMatch: boolean
  /** Focus symptoms no eligible card is tagged for. Shown to her, honestly. */
  uncovered: SymptomKey[]
}

/**
 * Can this card lead a week for her?
 *
 * `active_only` is re-checked here even though buildPlan() already filtered
 * on it: a stored plan reflects her exercise level when it was generated, and
 * she may have told us since that she is now limited.
 */
export function isEligibleForWeek(
  rec: WellnessRecommendation,
  signals: UserSignals,
  usedIds: ReadonlySet<string> = new Set()
): boolean {
  if (rec.category === 'supplement') return false
  if (usedIds.has(rec.id)) return false

  if (
    rec.who_for === 'active_only' &&
    (signals.exercise_level === 'limited' || signals.exercise_level === 'not_active')
  ) {
    return false
  }

  // Same detection the plan's personal notes use, against her CURRENT answers.
  const declared = new Set([...signals.medical_flags, ...signals.diet_restrictions])
  return !circumstancesFor(rec).some((c) => declared.has(c))
}

/**
 * Pick this week's change.
 *
 * Ranking, most important first:
 *   1. how many of her focus symptoms the card is tagged for
 *   2. scoreRecommendation() — everything else she told us at intake
 *   3. id — so equal cards resolve the same way every time
 *
 * `usedIds` is every recommendation already started in this programme, so a
 * change is never offered twice.
 */
export function selectWeeklyChange(
  plan: PlanCategories,
  focus: SymptomKey[],
  signals: UserSignals,
  usedIds: Iterable<string> = []
): WeeklyChangeSelection {
  const used = new Set(usedIds)
  const answers = signalsToAnswers(signals)

  const all = [
    ...plan.diet_adjustments,
    ...plan.lifestyle_adjustments,
    ...plan.mindset_recommendations,
    ...plan.supplement_suggestions,
  ]

  const ranked = all
    .filter((rec) => isEligibleForWeek(rec, signals, used))
    .map((rec) => ({
      rec,
      covers: focus.filter((s) => rec.targets_symptoms?.includes(s)),
      score: scoreRecommendation(rec, signals, answers),
    }))
    .filter((c) => c.covers.length > 0)
    .sort(
      (a, b) =>
        b.covers.length - a.covers.length ||
        b.score - a.score ||
        (a.rec.id < b.rec.id ? -1 : a.rec.id > b.rec.id ? 1 : 0)
    )
    .map(({ rec, covers }) => ({ rec, covers }))

  const coveredByAny = new Set(ranked.flatMap((c) => c.covers))
  const pick = ranked[0] ?? null

  return {
    pick,
    alternatives: ranked.slice(1, 1 + ALTERNATIVES_COUNT),
    closestMatch: pick !== null && pick.covers.length < focus.length,
    uncovered: focus.filter((s) => !coveredByAny.has(s)),
  }
}

/** The wording she was shown, for the record. Copied verbatim — never rewritten. */
export function weekSnapshot(rec: WellnessRecommendation): FocusWeekSnapshot {
  return {
    title: rec.title,
    body: rec.body,
    category: rec.category,
    targets_symptoms: rec.targets_symptoms ?? [],
  }
}

// ─── Moving through the weeks ─────────────────────────────────────────────────

type WeekState = Pick<
  FocusWeek,
  'sequence' | 'recommendation_id' | 'starts_on' | 'outcome' | 'released_on'
>

/**
 * Whole calendar days from `from` to `to`, both YYYY-MM-DD local dates, or
 * null if either is not a real date.
 *
 * Counted on calendar components via Date.UTC, never by subtracting local
 * timestamps: a clocks-change day is 23 or 25 hours long, and dividing that by
 * 24 would put a week's review a day early or late twice a year.
 */
export function daysBetween(from: string, to: string): number | null {
  const a = parseLocalCalendarDate(from)
  const b = parseLocalCalendarDate(to)
  if (!a || !b) return null
  const utc = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  return Math.round((utc(b) - utc(a)) / 86_400_000)
}

/** Can this week be reviewed today? Never before day 7 (decision 7). */
export function isReviewDue(startsOn: string, today: string): boolean {
  const days = daysBetween(startsOn, today)
  return days !== null && days >= REVIEW_AFTER_DAYS
}

/** The week in progress, if any. The database allows at most one. */
export function openWeek<W extends WeekState>(weeks: W[]): W | null {
  return weeks.find((w) => w.outcome === null) ?? null
}

/** Changes she kept and has not since dropped, most recent first. */
export function keptChanges<W extends WeekState>(weeks: W[]): W[] {
  return weeks
    .filter((w) => w.outcome === 'kept' && w.released_on === null)
    .sort((a, b) => b.sequence - a.sequence)
}

/**
 * The changes her daily check-in asks about: this week's, then the ones she
 * kept. Never more than MAX_CHANGES_ON_CHECKIN — and that holds by
 * construction, because canKeepAnother() refuses a keep that would exceed it.
 * Nothing is ever silently dropped from her list.
 */
export function changesOnCheckin<W extends WeekState>(weeks: W[]): W[] {
  const current = openWeek(weeks)
  return [...(current ? [current] : []), ...keptChanges(weeks)]
}

/**
 * Can she keep the week she is reviewing?
 *
 * Keeping it means, once the next week opens, her check-in holds: the kept
 * ones she already has + this one + the new week's change. If that would pass
 * MAX_CHANGES_ON_CHECKIN she is asked to drop one first, rather than having
 * the oldest vanish without her choosing it.
 */
export function canKeepAnother<W extends WeekState>(weeks: W[]): boolean {
  return keptChanges(weeks).length + 2 <= MAX_CHANGES_ON_CHECKIN
}

/** Every recommendation started in this programme, so none is offered twice. */
export function usedRecommendationIds<W extends WeekState>(weeks: W[]): string[] {
  return weeks.map((w) => w.recommendation_id)
}

/** The next sequence number for a new week (1 for the first). */
export function nextSequence<W extends WeekState>(weeks: W[]): number {
  return weeks.reduce((max, w) => Math.max(max, w.sequence), 0) + 1
}
