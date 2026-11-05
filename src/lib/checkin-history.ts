import type { SymptomCheckin, SymptomKey } from '@/types/database'
import { localCalendarDate, parseLocalCalendarDate } from '@/lib/checkin-schema'

/**
 * Pure helpers behind the check-in history page
 * (src/app/(app)/symptom-checkin/history/page.tsx).
 *
 * Everything here works on calendar-date strings (YYYY-MM-DD), never on UTC
 * instants: checkin_date is the user's own calendar day (see
 * localCalendarDate), and "the last 30 days" has to mean her last 30 days,
 * not the server's. The caller supplies `today` from the device.
 *
 * Descriptive only. These summarise what she logged — counts and averages —
 * and deliberately draw no conclusion from them. Interpreting a pattern is a
 * conversation for her GP, which the page says.
 */

export type HistoryRow = Pick<
  SymptomCheckin,
  'id' | 'checkin_date' | 'symptoms' | 'mood_score' | 'energy_level' | 'sleep_hours' | 'notes'
>

/** Columns the history page selects — kept beside the type it must satisfy. */
export const HISTORY_COLUMNS =
  'id, checkin_date, symptoms, mood_score, energy_level, sleep_hours, notes'

/** Check-ins per page of history. */
export const HISTORY_PAGE_SIZE = 30

/** Length of the trend window, in calendar days including today. */
export const TREND_WINDOW_DAYS = 30

/** Below this many check-ins in the window, averages say more about gaps than about her. */
export const MIN_CHECKINS_FOR_TRENDS = 3

/** A calendar date moved by a whole number of days, DST-safe. */
export function shiftCalendarDate(date: string, days: number): string | null {
  const parsed = parseLocalCalendarDate(date)
  if (!parsed) return null
  // setDate on a local-midnight Date moves by calendar days, so a DST change
  // inside the range cannot land the result on the wrong day.
  parsed.setDate(parsed.getDate() + days)
  return localCalendarDate(parsed)
}

/** Every calendar date in the window ending on `today`, oldest first. */
export function windowDates(today: string, days: number = TREND_WINDOW_DAYS): string[] {
  const dates: string[] = []
  for (let offset = days - 1; offset >= 0; offset--) {
    const date = shiftCalendarDate(today, -offset)
    if (date) dates.push(date)
  }
  return dates
}

/** Symptoms she rated, most severe first, ignoring anything that isn't a 1-5 score. */
export function ratedSymptoms(
  symptoms: HistoryRow['symptoms'] | null | undefined
): [SymptomKey, number][] {
  return (Object.entries(symptoms ?? {}) as [SymptomKey, unknown][])
    .filter((entry): entry is [SymptomKey, number] => isScore(entry[1]))
    .sort(([, a], [, b]) => b - a)
}

export interface DailyPoint {
  date: string
  mood: number | null
  energy: number | null
  sleep: number | null
}

export interface MetricSummary {
  /** Mean over the days that have a value, or null when none do. */
  average: number | null
  /** How many days contributed to the average. */
  count: number
}

export interface SymptomSummary {
  key: SymptomKey
  /** Days in the window on which she rated it. */
  days: number
  averageSeverity: number
}

export interface TrendSummary {
  /** One point per calendar day in the window, oldest first; null = not logged. */
  series: DailyPoint[]
  daysLogged: number
  mood: MetricSummary
  energy: MetricSummary
  sleep: MetricSummary
  /** Most frequent first; ties broken by higher average severity, then key. */
  symptoms: SymptomSummary[]
}

/**
 * Summarise the check-ins that fall inside the window ending on `today`.
 * Rows outside the window — older, or dated after `today` — are ignored.
 */
export function summariseWindow(
  rows: HistoryRow[],
  today: string,
  days: number = TREND_WINDOW_DAYS
): TrendSummary {
  const dates = windowDates(today, days)
  const inWindow = new Set(dates)
  const byDate = new Map<string, HistoryRow>()
  for (const row of rows) {
    if (inWindow.has(row.checkin_date)) byDate.set(row.checkin_date, row)
  }

  const series: DailyPoint[] = dates.map((date) => {
    const row = byDate.get(date)
    return {
      date,
      mood: row && isScore(row.mood_score) ? row.mood_score : null,
      energy: row && isScore(row.energy_level) ? row.energy_level : null,
      sleep: row ? toSleepHours(row.sleep_hours) : null,
    }
  })

  const symptomTotals = new Map<SymptomKey, { days: number; total: number }>()
  for (const row of Array.from(byDate.values())) {
    for (const [key, severity] of ratedSymptoms(row.symptoms)) {
      const current = symptomTotals.get(key) ?? { days: 0, total: 0 }
      symptomTotals.set(key, { days: current.days + 1, total: current.total + severity })
    }
  }

  const symptoms = Array.from(symptomTotals.entries())
    .map(([key, { days: count, total }]) => ({
      key,
      days: count,
      averageSeverity: total / count,
    }))
    .sort(
      (a, b) =>
        b.days - a.days ||
        b.averageSeverity - a.averageSeverity ||
        a.key.localeCompare(b.key)
    )

  return {
    series,
    daysLogged: byDate.size,
    mood: summarise(series.map((p) => p.mood)),
    energy: summarise(series.map((p) => p.energy)),
    sleep: summarise(series.map((p) => p.sleep)),
    symptoms,
  }
}

export interface MonthGroup {
  /** YYYY-MM */
  month: string
  rows: HistoryRow[]
}

/** Consecutive rows grouped by calendar month, preserving the input order. */
export function groupByMonth(rows: HistoryRow[]): MonthGroup[] {
  const groups: MonthGroup[] = []
  for (const row of rows) {
    const month = row.checkin_date.slice(0, 7)
    const last = groups[groups.length - 1]
    if (last && last.month === month) {
      last.rows.push(row)
    } else {
      groups.push({ month, rows: [row] })
    }
  }
  return groups
}

/**
 * The `before` cursor from the URL, or null if absent or not a real calendar
 * date. Anything else is ignored rather than passed to the query.
 */
export function parseBeforeCursor(value: string | string[] | undefined): string | null {
  if (typeof value !== 'string') return null
  return parseLocalCalendarDate(value) ? value : null
}

/** Mean rounded to one decimal place, for display. */
export function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10
}

function summarise(values: (number | null)[]): MetricSummary {
  const present = values.filter((v): v is number => v !== null)
  if (present.length === 0) return { average: null, count: 0 }
  return {
    average: present.reduce((sum, v) => sum + v, 0) / present.length,
    count: present.length,
  }
}

function isScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5
}

/** NUMERIC(3,1) arrives from PostgREST as a number or a string. */
function toSleepHours(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const hours = Number(value)
  return Number.isFinite(hours) && hours >= 0 && hours <= 24 ? hours : null
}
