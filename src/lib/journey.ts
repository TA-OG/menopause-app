/**
 * ─────────────────────────────────────────────────────────────────────────────
 * "YOUR PATH BACK TO YOU": the journey's rules
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * One focus, three stages (Care Journey, "Your care plan"):
 *
 *   1. Feel safe    days 1–7, free. Three invitations from Mel (decision 4).
 *   2. Foundations  from day 8, premium. The weekly focus programme
 *                   (focus-programme.ts): one non-supplement change a week,
 *                   reviewed before the next. Never a supplement, never a
 *                   card cautioned for her.
 *   3. Support      after SUPPORT_AFTER_REVIEWED_WEEKS reviewed weeks of
 *                   Foundations (decision 6: 8), and only once its wording
 *                   is approved (decision 8). Until then: "Waiting for you".
 *
 * Her morning answer changes only Mel's words that day, never her focus.
 *
 * Pure functions, no I/O.
 */

import type { FocusWeek, SymptomKey, UserSignals } from '@/types/database'
import { daysBetween } from './focus-programme'
import {
  FEEL_SAFE_INVITATIONS,
  FINISHING,
  MORNING,
  PATH,
  SAFETY_SIGNPOST,
  allJourneyCopy,
  type CopyLine,
} from './journey-copy'

// ─── Agreed numbers ───────────────────────────────────────────────────────────

/** Length of the Feel Safe stage, in days. The free week. */
export const FEEL_SAFE_DAYS = 7

/**
 * Reviewed weeks of Foundations before Support opens. Pamela: "Can it be 6 or
 * 8 weeks. 4 weeks isn't long enough"; Allan chose 8 (30 Oct 2026). A week
 * counts when she reviewed a change in it (kept or stopped). A swap is a
 * change of mind mid-week, and a rest week tries nothing, so neither counts.
 */
export const SUPPORT_AFTER_REVIEWED_WEEKS = 8

/**
 * "Hard" mornings in a row before Mel adds the safety line. Pamela has not
 * set this (decision 5), so it is a draft, and the line is pending with it.
 */
export const HARD_DAYS_BEFORE_SIGNPOST = 3

/**
 * Whether the journey is switched on for women. Admins can always walk
 * through it (that is how Pamela reviews it in the app). Turning this on
 * while any launch blocker remains fails the test suite.
 */
export const JOURNEY_LAUNCHED = false

// ─── Focus areas ──────────────────────────────────────────────────────────────

export type FocusAreaId =
  | 'rest'
  | 'calmer'
  | 'myself_again'
  | 'less_alone'
  | 'cooler'
  | 'energy'
  | 'clearer_head'
  | 'comfortable_body'
  | 'intimacy'
  | 'skin_hair'

export interface FocusArea {
  id: FocusAreaId
  label: string
  /** The intake symptoms it is built from. These become the programme's focus symptoms. */
  symptoms: SymptomKey[]
  /** False until it has approved content (decision 7). Never offered while false. */
  available: boolean
}

/** Care Journey, "Her one focus". Order is the document's. */
export const FOCUS_AREAS: FocusArea[] = [
  { id: 'rest', label: 'Better rest', symptoms: ['sleep_problems', 'fatigue'], available: true },
  { id: 'calmer', label: 'Feeling calmer', symptoms: ['anxiety', 'mood_changes'], available: true },
  { id: 'myself_again', label: 'Feeling like myself again', symptoms: [], available: false },
  { id: 'less_alone', label: 'Feeling less alone', symptoms: [], available: false },
  { id: 'cooler', label: 'Cooler days and nights', symptoms: ['hot_flashes', 'night_sweats'], available: true },
  { id: 'energy', label: 'More energy', symptoms: ['fatigue'], available: true },
  { id: 'clearer_head', label: 'A clearer head', symptoms: ['brain_fog'], available: true },
  { id: 'comfortable_body', label: 'Comfortable in my body', symptoms: ['joint_pain', 'weight_changes'], available: true },
  { id: 'intimacy', label: 'Intimacy and comfort', symptoms: ['low_libido', 'vaginal_dryness'], available: true },
  { id: 'skin_hair', label: 'Skin and hair', symptoms: ['skin_changes', 'hair_changes'], available: true },
]

export function focusArea(id: string): FocusArea | undefined {
  return FOCUS_AREAS.find((a) => a.id === id)
}

/**
 * The areas she may choose: available ones built from at least one symptom
 * she told us about. An area for something she never mentioned would give
 * the weekly programme nothing to work with.
 */
export function offeredFocusAreas(signals: Pick<UserSignals, 'symptoms'>): FocusArea[] {
  const hers = new Set(signals.symptoms)
  return FOCUS_AREAS.filter((a) => a.available && a.symptoms.some((s) => hers.has(s)))
}

/**
 * Mel's suggestion: the area holding the symptom she said weighs most;
 * otherwise the first area she is offered.
 *
 * Not applied: "start with feeling safe" for women who said they are really
 * struggling (decision 3). Pamela has not approved the rule, and the area it
 * points to ("Feeling like myself again") has no content yet.
 */
export function suggestedFocusArea(
  signals: Pick<UserSignals, 'symptoms' | 'primary_symptom'>
): FocusArea | null {
  const offered = offeredFocusAreas(signals)
  const primary = signals.primary_symptom
  const holdingPrimary = primary
    ? offered.find((a) => a.symptoms.includes(primary as SymptomKey))
    : undefined
  return holdingPrimary ?? offered[0] ?? null
}

/** The weekly programme's focus symptoms for an area: those she declared, in the area's order. */
export function programmeSymptoms(area: FocusArea, signals: Pick<UserSignals, 'symptoms'>): SymptomKey[] {
  const hers = new Set(signals.symptoms)
  return area.symptoms.filter((s) => hers.has(s)).slice(0, 3)
}

// ─── What Mel heard ───────────────────────────────────────────────────────────

/**
 * "The broken nights. Feeling stretched thin. Not quite recognising
 * yourself." Each is said only when her own answer says it.
 */
export function heardPhrases(answers: ReadonlyMap<string, string>): CopyLine[] {
  const out: CopyLine[] = []
  if (['poor', 'very_poor'].includes(answers.get('sleep_quality') ?? '')) out.push(FINISHING.heardBrokenNights)
  if (['high', 'very_high'].includes(answers.get('stress_level') ?? '')) out.push(FINISHING.heardStretchedThin)
  if (['bit_lost', 'stranger'].includes(answers.get('self_image') ?? '')) out.push(FINISHING.heardNotRecognising)
  return out
}

// ─── Where she is ─────────────────────────────────────────────────────────────

export type StageId = 'feel_safe' | 'foundations' | 'support'

type WeekLike = Pick<FocusWeek, 'kind' | 'outcome'>

export interface JourneyPosition {
  stage: StageId
  /** Day of the journey, 1 on the day she started. null if a date is unreadable. */
  day: number | null
  /** Feel Safe only: the invitation open today (the latest one reached). */
  invitation: (typeof FEEL_SAFE_INVITATIONS)[number] | null
  /** Reviewed weeks of Foundations so far. */
  reviewedWeeks: number
  /** Support has been earned by time AND its wording is approved. */
  supportOpen: boolean
}

export function reviewedFoundationWeeks(weeks: readonly WeekLike[]): number {
  return weeks.filter((w) => w.kind === 'change' && (w.outcome === 'kept' || w.outcome === 'stopped')).length
}

export function journeyPosition(
  startedOn: string,
  today: string,
  weeks: readonly WeekLike[]
): JourneyPosition {
  const elapsed = daysBetween(startedOn, today)
  const day = elapsed === null ? null : Math.max(1, elapsed + 1)
  const reviewedWeeks = reviewedFoundationWeeks(weeks)
  const supportOpen =
    reviewedWeeks >= SUPPORT_AFTER_REVIEWED_WEEKS && PATH.supportOpener.status !== 'pending'

  // An unreadable date keeps her in Feel Safe rather than moving her on.
  if (day === null || day <= FEEL_SAFE_DAYS) {
    const reached = FEEL_SAFE_INVITATIONS.filter((i) => i.opensOnDay <= (day ?? 1))
    return {
      stage: 'feel_safe',
      day,
      invitation: reached[reached.length - 1] ?? null,
      reviewedWeeks,
      supportOpen: false,
    }
  }
  return {
    stage: supportOpen ? 'support' : 'foundations',
    day,
    invitation: null,
    reviewedWeeks,
    supportOpen,
  }
}

// ─── Every morning ────────────────────────────────────────────────────────────

export type MorningFeeling = 'good' | 'up_and_down' | 'hard'
export const MORNING_FEELINGS: MorningFeeling[] = ['good', 'up_and_down', 'hard']

export function morningReply(feeling: MorningFeeling): CopyLine {
  return feeling === 'good'
    ? MORNING.replyGood
    : feeling === 'up_and_down'
      ? MORNING.replyUpAndDown
      : MORNING.replyHard
}

/** Answers to "How are you, really?" that should be met with the safety line at once. */
const STRUGGLING = new Set(['really_struggling', 'dont_know'])

/** She told us she is really struggling, or doesn't know any more. */
export function saidStruggling(howAreYou: string | undefined): boolean {
  return !!howAreYou && STRUGGLING.has(howAreYou)
}

/**
 * Should Mel add the safety line today?
 *
 *   - after HARD_DAYS_BEFORE_SIGNPOST "Hard" mornings in a row, today included
 *     (Care Journey, "Every morning", Safety)
 *   - or when she told us at intake she is really struggling or doesn't know
 *     any more. Not in the draft. Added because asking that question and not
 *     answering it would be unsafe. Part of decision 5 for Pamela.
 *
 * `recentFeelings` is newest first, one entry per day she answered. A day
 * she didn't answer breaks the run: it isn't evidence either way.
 */
export function showSafetySignpost(
  recentFeelings: readonly { date: string; feeling: MorningFeeling }[],
  today: string,
  howAreYou?: string
): boolean {
  if (saidStruggling(howAreYou)) return true
  let run = 0
  let expected = today
  for (const f of recentFeelings) {
    if (f.date !== expected || f.feeling !== 'hard') break
    run++
    const prev = new Date(`${expected}T00:00:00Z`)
    prev.setUTCDate(prev.getUTCDate() - 1)
    expected = prev.toISOString().slice(0, 10)
  }
  return run >= HARD_DAYS_BEFORE_SIGNPOST
}

export { SAFETY_SIGNPOST }

// ─── Can women see it yet? ────────────────────────────────────────────────────

/**
 * Lines the journey shows that are not yet cleared to show women. Support's
 * opener is excluded: Support stays closed while it is pending (see
 * journeyPosition), so it never shows.
 */
export function journeyLaunchBlockers(): CopyLine[] {
  return allJourneyCopy().filter(
    (l) => l !== PATH.supportOpener && (l.status === 'pending' || l.status === 'redrafted')
  )
}

/**
 * Launch blockers that are not a line of copy. Each is a check someone must
 * do and record before women see the journey. Remove an entry only in the
 * same commit as the record of it being done.
 */
export const JOURNEY_LAUNCH_CHECKLIST: string[] = [
  // docs/focus-programme.md, "Blocking before any of this is shown to users"
  'Symptom-tag audit by Pamela: Foundations chooses weekly changes from card tags, and each tag is a claim',
  'GP-signpost thresholds for worsening focus symptoms, set by Pamela (focus programme decision 9)',
  'Migrations 039 and 040 applied to production',
]

export function journeyVisibleTo(viewer: { isAdmin: boolean }): boolean {
  return (
    viewer.isAdmin ||
    (JOURNEY_LAUNCHED && journeyLaunchBlockers().length === 0 && JOURNEY_LAUNCH_CHECKLIST.length === 0)
  )
}
