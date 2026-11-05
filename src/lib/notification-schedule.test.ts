import { describe, it, expect } from 'vitest'
import { localHourAndDate, isCheckinNudgeDue, checkinNudgeMessage } from './notification-schedule'
import { SUPPORTED_LOCALES } from '@/lib/locale-geo-map'

describe('localHourAndDate', () => {
  it('returns null for a missing timezone', () => {
    expect(localHourAndDate(null)).toBeNull()
    expect(localHourAndDate(undefined)).toBeNull()
    expect(localHourAndDate('')).toBeNull()
  })

  it('returns null for an invalid IANA timezone rather than throwing', () => {
    expect(localHourAndDate('Not/A/Real/Zone')).toBeNull()
  })

  it('returns a valid hour (0-23) and YYYY-MM-DD date for a real timezone', () => {
    const result = localHourAndDate('Europe/London')
    expect(result).not.toBeNull()
    expect(result!.hour).toBeGreaterThanOrEqual(0)
    expect(result!.hour).toBeLessThanOrEqual(23)
    expect(result!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('produces different local hours for timezones far enough apart', () => {
    // Not asserting exact hours (test would be flaky across DST/run time) —
    // just that two very different timezones aren't silently collapsed to
    // the same value, which would mean the timezone parameter is being ignored.
    const london = localHourAndDate('Europe/London')
    const auckland = localHourAndDate('Pacific/Auckland')
    expect(london).not.toBeNull()
    expect(auckland).not.toBeNull()
    // Auckland is always at least 10 hours ahead of London year-round.
    expect(london!.hour).not.toBe(auckland!.hour)
  })
})

describe('isCheckinNudgeDue', () => {
  const at = (hour: number) => ({ hour, date: '2026-11-03' })

  it('is due at her reminder hour when she has not checked in today', () => {
    expect(isCheckinNudgeDue(at(9), 9, false)).toBe(true)
  })

  it('follows the hour she picked, not a fixed one', () => {
    expect(isCheckinNudgeDue(at(7), 7, false)).toBe(true)
    expect(isCheckinNudgeDue(at(9), 7, false)).toBe(false)
  })

  it('is not due once she has already checked in today', () => {
    expect(isCheckinNudgeDue(at(9), 9, true)).toBe(false)
  })

  it('is not due at any other hour', () => {
    for (let h = 0; h < 24; h++) {
      if (h === 9) continue
      expect(isCheckinNudgeDue(at(h), 9, false)).toBe(false)
    }
  })

  it('is never due when no reminder hour has been set', () => {
    expect(isCheckinNudgeDue(at(0), null, false)).toBe(false)
    expect(isCheckinNudgeDue(at(9), null, false)).toBe(false)
  })

  it('is never due when the timezone could not be resolved', () => {
    expect(isCheckinNudgeDue(null, 9, false)).toBe(false)
  })
})

describe('checkinNudgeMessage', () => {
  it('has a non-empty, distinct reminder for every supported locale', () => {
    const bodies = SUPPORTED_LOCALES.map((l) => checkinNudgeMessage(l).body)
    for (const body of bodies) expect(body.trim().length).toBeGreaterThan(0)
    // A copy-pasted English string in another locale would collapse this set.
    expect(new Set(bodies).size).toBe(SUPPORTED_LOCALES.length)
  })

  it('always links to the check-in page and keeps the brand title', () => {
    for (const l of SUPPORTED_LOCALES) {
      expect(checkinNudgeMessage(l).url).toBe('/symptom-checkin')
      expect(checkinNudgeMessage(l).title).toBe('Aunty Mel')
    }
  })

  it('falls back to English for a missing or unknown locale instead of sending nothing', () => {
    const english = checkinNudgeMessage('en').body
    expect(checkinNudgeMessage(null).body).toBe(english)
    expect(checkinNudgeMessage(undefined).body).toBe(english)
    expect(checkinNudgeMessage('xx').body).toBe(english)
  })
})
