/**
 * Request contracts and decisions for the focus programme routes
 * (src/app/api/focus/**). Pure — no I/O — so every rule a route enforces is
 * testable without a database, the same split as checkin-schema.ts.
 *
 * The routes load data, call these, and write. Nothing here trusts the client:
 * every id, symptom and date in a request is checked against what the server
 * itself loaded for her.
 */

import { z } from 'zod'
import type {
  FocusProgramme,
  FocusWeek,
  SymptomKey,
  UserSignals,
  WellnessRecommendation,
} from '@/types/database'
import { SYMPTOM_KEYS } from './checkin-schema'
import {
  canKeepAnother,
  changesOnCheckin,
  daysBetween,
  focusSymptomOptions,
  isReviewDue,
  keptChanges,
  openWeek,
  selectWeeklyChange,
  usedRecommendationIds,
  type WeeklyChangeCandidate,
  type WeeklyChangeSelection,
} from './focus-programme'

// ─── Dates ────────────────────────────────────────────────────────────────────

const LocalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/** Today's UTC calendar date, YYYY-MM-DD. */
export function utcCalendarDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

/**
 * Is `today` (her local date, sent by the client) a date that could actually
 * be today somewhere?
 *
 * Every inhabited timezone is within UTC−12 … UTC+14, so her local date is
 * always the UTC date, the day before, or the day after. Anything else is
 * either a broken clock or an attempt to backdate a week so its review opens
 * early — so it is refused rather than believed.
 */
export function isPlausibleLocalToday(today: string, now: Date = new Date()): boolean {
  const diff = daysBetween(utcCalendarDate(now), today)
  return diff !== null && diff >= -1 && diff <= 1
}

// ─── Request bodies ───────────────────────────────────────────────────────────

const FocusKey = z.enum(SYMPTOM_KEYS)

export const StartProgrammeSchema = z.object({
  focus_symptoms: z.array(FocusKey).min(1).max(10),
  today: LocalDate,
})

export const OpenWeekSchema = z.object({
  today: LocalDate,
  /** Omitted = the app's pick. Otherwise must be the pick or an alternative. */
  recommendation_id: z.string().min(1).max(200).optional(),
})

export const ReviewWeekSchema = z.object({
  today: LocalDate,
  outcome: z.enum(['kept', 'stopped', 'swapped']),
  /** Kept changes she chooses to drop, to make room for keeping this one. */
  release_week_ids: z.array(z.string().uuid()).max(10).default([]),
})

export const FocusCheckinSchema = z.object({
  checkin_date: LocalDate,
  /** Ratings for her focus symptoms only, 1–5. */
  ratings: z.record(FocusKey, z.number().int().min(1).max(5)).default({}),
  /** Recommendation ids she answered "Yes" for. */
  done: z.array(z.string().min(1).max(200)).max(10).default([]),
  /** Recommendation ids she answered "Not today" for. */
  not_done: z.array(z.string().min(1).max(200)).max(10).default([]),
})

/**
 * Field path + issue code only — never zod's message, which can interpolate
 * the received value (here: her symptom ratings). Same rule as the existing
 * check-in route.
 */
export function describeIssues(error: z.ZodError): string {
  return error.issues
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.code}`)
    .join('; ')
}

// ─── Decisions ────────────────────────────────────────────────────────────────

/** A refusal, with the HTTP status the route should return. */
export interface Refusal {
  ok: false
  status: 400 | 403 | 404 | 409
  error: string
}

export type Decision<T> = ({ ok: true } & T) | Refusal

const refuse = (status: Refusal['status'], error: string): Refusal => ({
  ok: false,
  status,
  error,
})

type WeekRow = Pick<
  FocusWeek,
  'id' | 'sequence' | 'recommendation_id' | 'starts_on' | 'outcome' | 'released_on'
>

/**
 * Which change opens next. Only the app's pick or one of the alternatives it
 * offered may be chosen — a client cannot start a week on an arbitrary card,
 * including a supplement or one cautioned for her.
 */
export function chooseWeekChange(
  selection: WeeklyChangeSelection,
  recommendationId?: string
): Decision<{ choice: WeeklyChangeCandidate }> {
  if (!selection.pick) {
    return refuse(409, 'No change in your plan matches your focus symptoms')
  }
  if (!recommendationId || recommendationId === selection.pick.rec.id) {
    return { ok: true, choice: selection.pick }
  }
  const alternative = selection.alternatives.find((a) => a.rec.id === recommendationId)
  if (!alternative) return refuse(400, 'That change is not one of the options offered')
  return { ok: true, choice: alternative }
}

/**
 * Can she close the open week this way today?
 *
 *   kept / stopped — only from day 7 (decision 7)
 *   swapped        — any time; she is choosing a different change, not
 *                    judging this one
 *   kept           — only if her daily check-in would stay within the limit,
 *                    after any releases she asked for
 */
export function decideReview(
  weeks: WeekRow[],
  input: { today: string; outcome: 'kept' | 'stopped' | 'swapped'; release_week_ids: string[] }
): Decision<{ week: WeekRow; releaseIds: string[] }> {
  const week = openWeek(weeks)
  if (!week) return refuse(409, 'There is no week in progress to review')

  if (input.outcome !== 'swapped' && !isReviewDue(week.starts_on, input.today)) {
    return refuse(409, 'This week can be reviewed from day 7')
  }

  const releasable = new Set(keptChanges(weeks).map((w) => w.id))
  const releaseIds = Array.from(new Set(input.release_week_ids))
  if (releaseIds.some((id) => !releasable.has(id))) {
    return refuse(400, 'Only a change you are keeping can be dropped')
  }

  if (input.outcome === 'kept') {
    const afterRelease = weeks.map((w) =>
      releaseIds.includes(w.id) ? { ...w, released_on: input.today } : w
    )
    if (!canKeepAnother(afterRelease)) {
      return refuse(409, 'Drop one of the changes you are keeping first')
    }
  }

  return { ok: true, week, releaseIds }
}

/**
 * Is this daily check-in about her programme? Ratings must be for her focus
 * symptoms, and Yes / Not today answers for changes on her check-in.
 */
export function decideFocusCheckin(
  programme: Pick<FocusProgramme, 'focus_symptoms'>,
  weeks: WeekRow[],
  input: { ratings: Partial<Record<SymptomKey, number>>; done: string[]; not_done: string[] }
): Decision<object> {
  const focus = new Set<string>(programme.focus_symptoms)
  if (Object.keys(input.ratings).some((k) => !focus.has(k))) {
    return refuse(400, 'Ratings are only for your focus symptoms')
  }

  const onCheckin = new Set(changesOnCheckin(weeks).map((w) => w.recommendation_id))
  const answered = [...input.done, ...input.not_done]
  if (answered.some((id) => !onCheckin.has(id))) {
    return refuse(400, 'That change is not on your check-in')
  }
  if (input.done.some((id) => input.not_done.includes(id))) {
    return refuse(400, 'A change cannot be both done and not done')
  }
  if (answered.length === 0 && Object.keys(input.ratings).length === 0) {
    return refuse(400, 'Nothing to save')
  }
  return { ok: true }
}

/**
 * A new week may not start before the last one did. isPlausibleLocalToday()
 * already bounds `today` to ±1 day of UTC; this closes the remaining gap, where
 * a client sends "yesterday" to open a week dated before the one it follows.
 */
export function decideWeekStart(weeks: WeekRow[], today: string): Decision<object> {
  const latest = weeks.reduce<string | null>(
    (max, w) => (max === null || w.starts_on > max ? w.starts_on : max),
    null
  )
  if (latest !== null) {
    const diff = daysBetween(latest, today)
    if (diff === null || diff < 0) {
      return refuse(400, 'A new week cannot start before the previous one')
    }
  }
  return { ok: true }
}

// ─── Query string ─────────────────────────────────────────────────────────────

/**
 * `?focus=hot_flashes,anxiety` → ['hot_flashes', 'anxiety']. Only splits;
 * whether each one is hers is normaliseFocusSymptoms()'s job. Capped so a
 * long query string cannot become a long loop.
 */
export function parseFocusParam(value: string | null): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 10)
}

// ─── What the client is shown about a change ──────────────────────────────────

export interface WeekView {
  week: FocusWeek
  /**
   * The card as it is in her plan NOW, with personal notes re-derived from her
   * current answers — this is where cautions come from. null when the card is
   * no longer in her plan (e.g. she redid intake); the UI then shows the
   * snapshot and says so, and must not present it as current advice.
   */
  current: WellnessRecommendation | null
  /** Whole days since the week started (0 on day one). */
  dayIndex: number | null
  reviewDue: boolean
}

export function weekView(
  week: FocusWeek,
  planById: ReadonlyMap<string, WellnessRecommendation>,
  today: string
): WeekView {
  return {
    week,
    current: planById.get(week.recommendation_id) ?? null,
    dayIndex: daysBetween(week.starts_on, today),
    reviewDue: week.outcome === null && isReviewDue(week.starts_on, today),
  }
}

// ─── GET /api/focus ───────────────────────────────────────────────────────────

/** The columns of symptom_checkins the programme reads. */
export interface CheckinRow {
  checkin_date: string
  symptoms: Record<string, unknown> | null
  tried_today: string[] | null
}

export type FocusRatings = Partial<Record<SymptomKey, number>>

/**
 * Her ratings for her focus symptoms only. The row also holds everything else
 * she logged on the full check-in form; the programme has no business
 * returning that, so it is dropped here rather than passed through.
 */
export function focusRatings(
  symptoms: Record<string, unknown> | null,
  focus: readonly SymptomKey[]
): FocusRatings {
  const out: FocusRatings = {}
  for (const key of focus) {
    const value = symptoms?.[key]
    if (typeof value === 'number') out[key] = value
  }
  return out
}

export type FocusState =
  | {
      state: 'none'
      /** Symptoms she may focus on: those she declared at intake. */
      options: SymptomKey[]
      /** What week 1 would be for `?focus=`, so she sees it before starting. */
      preview: WeeklyChangeSelection | null
    }
  | {
      state: 'active'
      options: SymptomKey[]
      programme: FocusProgramme
      current: WeekView | null
      kept: WeekView[]
      /** Next week's choice — only when no week is open. */
      next: WeeklyChangeSelection | null
      /** Whether the open week can be kept without dropping another first. */
      canKeepWithoutRelease: boolean
      /** Today's answers, for her focus symptoms and check-in changes only. */
      todayCheckin: { ratings: FocusRatings; done: string[] } | null
      /** Day-by-day focus ratings since the open week started, oldest first. */
      weekRatings: { date: string; ratings: FocusRatings }[]
    }

export interface FocusStateInput {
  signals: UserSignals
  plan: Parameters<typeof selectWeeklyChange>[0]
  planById: ReadonlyMap<string, WellnessRecommendation>
  programme: FocusProgramme | null
  weeks: FocusWeek[]
  today: string
  /** Validated (normaliseFocusSymptoms) preview symptoms, or null. */
  previewFocus: SymptomKey[] | null
  /** Her check-in rows from the open week's start to today. */
  checkins: CheckinRow[]
}

export function buildFocusState(input: FocusStateInput): FocusState {
  const { signals, plan, planById, programme, weeks, today } = input
  const options = focusSymptomOptions(signals)

  if (!programme) {
    return {
      state: 'none',
      options,
      preview: input.previewFocus ? selectWeeklyChange(plan, input.previewFocus, signals) : null,
    }
  }

  const focus = programme.focus_symptoms
  const current = openWeek(weeks)
  const onCheckin = new Set(changesOnCheckin(weeks).map((w) => w.recommendation_id))

  const todayRow = input.checkins.find((c) => c.checkin_date === today)
  const weekRatings = current
    ? input.checkins
        .filter((c) => {
          const d = daysBetween(current.starts_on, c.checkin_date)
          return d !== null && d >= 0 && c.checkin_date <= today
        })
        .sort((a, b) => (a.checkin_date < b.checkin_date ? -1 : 1))
        .map((c) => ({ date: c.checkin_date, ratings: focusRatings(c.symptoms, focus) }))
    : []

  return {
    state: 'active',
    options,
    programme,
    current: current ? weekView(current, planById, today) : null,
    kept: keptChanges(weeks).map((w) => weekView(w, planById, today)),
    next: current
      ? null
      : selectWeeklyChange(plan, focus, signals, usedRecommendationIds(weeks)),
    canKeepWithoutRelease: canKeepAnother(weeks),
    todayCheckin: todayRow
      ? {
          ratings: focusRatings(todayRow.symptoms, focus),
          done: (todayRow.tried_today ?? []).filter((id) => onCheckin.has(id)),
        }
      : null,
    weekRatings,
  }
}
