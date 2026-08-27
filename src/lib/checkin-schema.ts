import { z } from 'zod'
import type { SymptomKey } from '@/types/database'

/**
 * Pure validation + date helpers for the daily symptom check-in
 * (src/app/api/symptom-checkin/route.ts and src/app/(app)/symptom-checkin/page.tsx).
 *
 * Extracted so the two things that silently broke saving — the request contract
 * and the calendar-date derivation — are testable without a database or a
 * browser, matching how notification-schedule.ts keeps the local-time logic
 * pure and separate from its cron route.
 *
 * The schema is written against the REAL table definition in
 * supabase/migrations/004_symptom_checkins.sql:
 *   symptoms          JSONB     NOT NULL DEFAULT '{}'
 *   severity_overall  SMALLINT  NULL, CHECK 1-5
 *   mood_score        SMALLINT  NULL, CHECK 1-5
 *   energy_level      SMALLINT  NULL, CHECK 1-5
 *   sleep_hours       NUMERIC(3,1) NULL, CHECK 0-24
 *   tried_today       TEXT[]    NOT NULL DEFAULT '{}'
 *   notes             TEXT      NULL
 * Anything the column accepts, the schema must accept; anything the column
 * rejects, the schema must reject with a 400 rather than letting Postgres
 * raise a 500.
 */

/**
 * Exhaustive map of the symptom keys the tracker accepts.
 *
 * Declared as Record<SymptomKey, true> deliberately: TypeScript then fails the
 * build both if a key here is not a real SymptomKey (typo) and if a SymptomKey
 * is missing (drift), so the accepted set can never quietly diverge from the
 * union in src/types/database.ts.
 */
const SYMPTOM_KEY_MAP: Record<SymptomKey, true> = {
  hot_flashes: true,
  night_sweats: true,
  sleep_problems: true,
  mood_changes: true,
  anxiety: true,
  brain_fog: true,
  weight_changes: true,
  joint_pain: true,
  low_libido: true,
  fatigue: true,
  vaginal_dryness: true,
  skin_changes: true,
  hair_changes: true,
  other: true,
}

export const SYMPTOM_KEYS = Object.keys(SYMPTOM_KEY_MAP) as [SymptomKey, ...SymptomKey[]]

/** Severity/score scale shared by symptoms, mood and energy: whole numbers 1-5. */
const Scale1To5 = z.number().int().min(1).max(5)

export const CheckinSchema = z.object({
  checkin_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),

  // NOT NULL DEFAULT '{}' in Postgres: an explicit null must become {} here,
  // or the insert would fail the NOT NULL constraint as a 500 instead of
  // saving. An *omitted* key stays undefined on purpose — the route upserts,
  // and a column absent from the payload is left untouched on conflict, so
  // omitting a field must never blank out what is already stored.
  symptoms: z
    .record(z.enum(SYMPTOM_KEYS), Scale1To5)
    .optional()
    .nullable()
    .transform((v) => (v === null ? {} : v)),

  // Nullable columns. These MUST accept null, not just undefined: the client
  // sends explicit nulls for "not filled in", and an explicit null is also the
  // only way a user can clear a value they previously saved.
  severity_overall: Scale1To5.optional().nullable(),
  mood_score: Scale1To5.optional().nullable(),
  energy_level: Scale1To5.optional().nullable(),
  sleep_hours: z.number().min(0).max(24).optional().nullable(),

  // NOT NULL DEFAULT '{}' in Postgres — same reasoning as `symptoms`.
  tried_today: z
    .array(z.string())
    .optional()
    .nullable()
    .transform((v) => (v === null ? [] : v)),

  notes: z.string().max(2000).optional().nullable(),
})

export type CheckinInput = z.input<typeof CheckinSchema>
export type CheckinPayload = z.output<typeof CheckinSchema>

/**
 * Today's calendar date (YYYY-MM-DD) in the *local* timezone of the caller.
 *
 * Deliberately not `new Date().toISOString().split('T')[0]`, which yields the
 * UTC date. For a UK user in BST (UTC+1), a check-in logged at 00:30 on the
 * 27th has a UTC date of the 26th, so it would be written to — and, because
 * the route upserts on (user_id, checkin_date), silently overwrite —
 * yesterday's row while the page header displayed today's date.
 *
 * Same principle as localHourAndDate() in notification-schedule.ts: a daily
 * record's date must come from the user's calendar, never from UTC.
 */
export function localCalendarDate(now: Date = new Date()): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Inverse of localCalendarDate(): a YYYY-MM-DD string back to a Date at local
 * midnight on that calendar day.
 *
 * Deliberately not `new Date('2026-08-26')`, which the spec parses as UTC
 * midnight — in any negative-offset timezone that renders as the *previous*
 * day, so the page header would disagree with the date actually being saved.
 * Returns null for anything that is not a well-formed calendar date.
 */
export function parseLocalCalendarDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const [, year, month, day] = match.map(Number)
  const date = new Date(year, month - 1, day)
  // Rejects impossible dates like 2026-02-30, which Date silently rolls over.
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }
  return date
}
