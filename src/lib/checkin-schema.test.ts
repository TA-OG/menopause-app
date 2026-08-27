import { describe, it, expect } from 'vitest'
import {
  CheckinSchema,
  SYMPTOM_KEYS,
  buildCheckinPayload,
  FIELDS_THE_CHECKIN_FORM_MUST_NOT_SEND,
  localCalendarDate,
  parseLocalCalendarDate,
} from './checkin-schema'

/**
 * Regression tests for the daily symptom check-in save path.
 *
 * The original bug: the check-in page sends `notes: notes.trim() || null`, but
 * the route schema declared `notes` as `.optional()` only. Zod's `.optional()`
 * accepts `undefined`, NOT `null` — so every check-in saved with an empty
 * notes box was rejected with a 400 and the user saw "Could not save your
 * check-in". Only check-ins that happened to include typed notes ever saved.
 */

/**
 * The payload src/app/(app)/symptom-checkin/page.tsx sends.
 *
 * Built by calling the SAME function the page calls, not copied out by hand.
 * The hand-copied version of this helper is why the `tried_today: []` defect
 * survived: it was commented "the exact payload the page sends" and it faithfully
 * reproduced the bug, so every test here passed while the real save wiped the
 * column on every check-in.
 */
function pagePayload(overrides: Record<string, unknown> = {}) {
  return {
    ...buildCheckinPayload({
      checkin_date: '2026-08-26',
      symptoms: {},
      mood_score: 3,
      energy_level: 3,
      sleep_hours: 7,
      notes: '',
    }),
    ...overrides,
  }
}

describe('CheckinSchema — the payload the check-in page actually sends', () => {
  it('accepts a check-in with an empty notes box (the reported failure)', () => {
    const result = CheckinSchema.safeParse(pagePayload())
    expect(result.success).toBe(true)
  })

  it('accepts a check-in with notes filled in', () => {
    const result = CheckinSchema.safeParse(pagePayload({ notes: 'Slept badly, hot flushes at 3am' }))
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.notes).toBe('Slept badly, hot flushes at 3am')
  })

  it('accepts rated symptoms and half-hour sleep values from the sliders', () => {
    const result = CheckinSchema.safeParse(
      pagePayload({ symptoms: { hot_flashes: 4, anxiety: 2 }, sleep_hours: 6.5 })
    )
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.symptoms).toEqual({ hot_flashes: 4, anxiety: 2 })
  })

  it('keeps an explicit null note as null so a cleared note is actually cleared', () => {
    const result = CheckinSchema.safeParse(pagePayload({ notes: null }))
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.notes).toBeNull()
  })
})

describe('CheckinSchema — NOT NULL columns are never handed a null', () => {
  // symptoms and tried_today are `NOT NULL DEFAULT '{}'` in migration 004.
  // Passing null through would turn a save into a 500, so they normalise.
  it('normalises null symptoms to an empty object', () => {
    const result = CheckinSchema.safeParse(pagePayload({ symptoms: null }))
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.symptoms).toEqual({})
  })

  it('leaves an OMITTED symptoms key undefined, so an upsert cannot blank out a stored value', () => {
    // The route upserts: a column absent from the payload is left untouched on
    // conflict. Defaulting an omitted key to {} here would silently wipe
    // symptoms already logged for that day.
    const withoutSymptoms = pagePayload()
    delete (withoutSymptoms as Record<string, unknown>).symptoms
    const result = CheckinSchema.safeParse(withoutSymptoms)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.symptoms).toBeUndefined()
  })

  it('leaves an OMITTED tried_today key undefined for the same reason', () => {
    const withoutTried = pagePayload()
    delete (withoutTried as Record<string, unknown>).tried_today
    const result = CheckinSchema.safeParse(withoutTried)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.tried_today).toBeUndefined()
  })

  it('normalises null tried_today to an empty array', () => {
    const result = CheckinSchema.safeParse(pagePayload({ tried_today: null }))
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.tried_today).toEqual([])
  })
})

describe('CheckinSchema — rejects what Postgres would reject', () => {
  it('rejects a missing checkin_date', () => {
    const withoutDate = pagePayload()
    delete (withoutDate as Record<string, unknown>).checkin_date
    expect(CheckinSchema.safeParse(withoutDate).success).toBe(false)
  })

  it('rejects a non-ISO checkin_date', () => {
    expect(CheckinSchema.safeParse(pagePayload({ checkin_date: '26/08/2026' })).success).toBe(false)
  })

  it('rejects a null checkin_date — the row is keyed on it', () => {
    expect(CheckinSchema.safeParse(pagePayload({ checkin_date: null })).success).toBe(false)
  })

  it.each([0, 6, -1])('rejects an out-of-range severity (%s), matching the CHECK constraint', (v) => {
    expect(CheckinSchema.safeParse(pagePayload({ symptoms: { anxiety: v } })).success).toBe(false)
  })

  it('rejects a fractional severity — the column is SMALLINT', () => {
    expect(CheckinSchema.safeParse(pagePayload({ symptoms: { anxiety: 2.5 } })).success).toBe(false)
  })

  it('rejects a fractional mood score — the column is SMALLINT', () => {
    expect(CheckinSchema.safeParse(pagePayload({ mood_score: 3.5 })).success).toBe(false)
  })

  it('rejects an unknown symptom key so junk cannot reach the JSONB column', () => {
    expect(CheckinSchema.safeParse(pagePayload({ symptoms: { not_a_symptom: 3 } })).success).toBe(false)
  })

  it.each([-0.5, 24.5])('rejects sleep_hours outside the 0-24 CHECK constraint (%s)', (v) => {
    expect(CheckinSchema.safeParse(pagePayload({ sleep_hours: v })).success).toBe(false)
  })

  it('rejects notes longer than the 2000-character limit', () => {
    expect(CheckinSchema.safeParse(pagePayload({ notes: 'a'.repeat(2001) })).success).toBe(false)
  })

  it('accepts notes exactly at the 2000-character limit', () => {
    expect(CheckinSchema.safeParse(pagePayload({ notes: 'a'.repeat(2000) })).success).toBe(true)
  })
})

describe('SYMPTOM_KEYS', () => {
  it('covers every symptom the check-in page offers', () => {
    const offeredByPage = [
      'hot_flashes', 'night_sweats', 'sleep_problems', 'mood_changes',
      'anxiety', 'brain_fog', 'fatigue', 'low_libido',
    ]
    for (const key of offeredByPage) {
      expect(SYMPTOM_KEYS).toContain(key)
    }
  })

  it('has no duplicates', () => {
    expect(new Set(SYMPTOM_KEYS).size).toBe(SYMPTOM_KEYS.length)
  })
})

describe('localCalendarDate', () => {
  it('formats a local date as YYYY-MM-DD with zero padding', () => {
    expect(localCalendarDate(new Date(2026, 0, 5, 13, 0, 0))).toBe('2026-01-05')
  })

  it('uses the LOCAL calendar day, not the UTC one', () => {
    // 00:30 local. In any timezone ahead of UTC this instant is still the
    // previous day in UTC — the case that made a late-night check-in
    // overwrite the previous day's row.
    const justAfterMidnight = new Date(2026, 7, 27, 0, 30, 0)
    expect(localCalendarDate(justAfterMidnight)).toBe('2026-08-27')
    expect(localCalendarDate(justAfterMidnight)).toBe(
      `${justAfterMidnight.getFullYear()}-${String(justAfterMidnight.getMonth() + 1).padStart(2, '0')}-${String(justAfterMidnight.getDate()).padStart(2, '0')}`
    )
  })

  it('produces a value the API schema accepts', () => {
    const result = CheckinSchema.safeParse(pagePayload({ checkin_date: localCalendarDate() }))
    expect(result.success).toBe(true)
  })
})

describe('parseLocalCalendarDate', () => {
  it('round-trips with localCalendarDate at local midnight', () => {
    const parsed = parseLocalCalendarDate('2026-08-26')
    expect(parsed).not.toBeNull()
    expect(localCalendarDate(parsed as Date)).toBe('2026-08-26')
    expect((parsed as Date).getHours()).toBe(0)
  })

  it('rejects malformed and impossible dates', () => {
    expect(parseLocalCalendarDate('2026-8-26')).toBeNull()
    expect(parseLocalCalendarDate('not-a-date')).toBeNull()
    expect(parseLocalCalendarDate('2026-02-30')).toBeNull()
    expect(parseLocalCalendarDate('2026-13-01')).toBeNull()
  })

  it('keeps the calendar day the header shows in step with the day saved', () => {
    // The whole point: header and stored row must never disagree.
    const today = localCalendarDate()
    expect(localCalendarDate(parseLocalCalendarDate(today) as Date)).toBe(today)
  })
})

describe('buildCheckinPayload — the form only sends what it owns', () => {
  const payload = buildCheckinPayload({
    checkin_date: '2026-08-26',
    symptoms: { hot_flashes: 3 },
    mood_score: 4,
    energy_level: 2,
    sleep_hours: 6.5,
    notes: '  ',
  })

  /**
   * THE REGRESSION THIS FILE EXISTS FOR.
   *
   * The route upserts on (user_id, checkin_date), so any column present in the
   * payload is overwritten on conflict. The form used to hard-code
   * `tried_today: []`, which meant a daily check-in silently blanked whatever
   * had ticked plan items off that day. Nothing writes the column yet, so the
   * damage was invisible — it would have surfaced only once the plan could tick
   * items, far from the cause.
   */
  it('omits every column the form does not own', () => {
    for (const field of FIELDS_THE_CHECKIN_FORM_MUST_NOT_SEND) {
      expect(
        Object.prototype.hasOwnProperty.call(payload, field),
        `the check-in form must not send "${field}" — the route upserts, so ` +
          `including it blanks out whatever else wrote that column`
      ).toBe(false)
    }
  })

  it('sends exactly the fields the form collects, and nothing else', () => {
    expect(Object.keys(payload).sort()).toEqual([
      'checkin_date',
      'energy_level',
      'mood_score',
      'notes',
      'sleep_hours',
      'symptoms',
    ])
  })

  it('produces a body the route will accept', () => {
    const result = CheckinSchema.safeParse(payload)
    expect(result.success).toBe(true)
  })

  it('clears a note the user emptied, because the form does own that field', () => {
    expect(payload.notes).toBeNull()
  })

  it('keeps a note the user typed, trimmed', () => {
    const withNote = buildCheckinPayload({
      checkin_date: '2026-08-26',
      symptoms: {},
      mood_score: 3,
      energy_level: 3,
      sleep_hours: 7,
      notes: '  hot flushes at 3am  ',
    })
    expect(withNote.notes).toBe('hot flushes at 3am')
  })
})
