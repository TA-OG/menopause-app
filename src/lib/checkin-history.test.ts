import { describe, it, expect } from 'vitest'
import {
  groupByMonth,
  parseBeforeCursor,
  ratedSymptoms,
  shiftCalendarDate,
  summariseWindow,
  windowDates,
  type HistoryRow,
} from './checkin-history'

function row(checkin_date: string, overrides: Partial<HistoryRow> = {}): HistoryRow {
  return {
    id: `id-${checkin_date}`,
    checkin_date,
    symptoms: {},
    mood_score: null,
    energy_level: null,
    sleep_hours: null,
    notes: null,
    ...overrides,
  }
}

describe('shiftCalendarDate', () => {
  it('crosses month and year boundaries', () => {
    expect(shiftCalendarDate('2026-03-01', -1)).toBe('2026-02-28')
    expect(shiftCalendarDate('2024-03-01', -1)).toBe('2024-02-29')
    expect(shiftCalendarDate('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('moves by calendar days across the UK clock changes', () => {
    expect(shiftCalendarDate('2026-03-30', -1)).toBe('2026-03-29')
    expect(shiftCalendarDate('2026-10-25', 1)).toBe('2026-10-26')
  })

  it('rejects a date that does not exist', () => {
    expect(shiftCalendarDate('2026-02-30', 1)).toBeNull()
  })
})

describe('windowDates', () => {
  it('returns every day in the window, oldest first, ending today', () => {
    const dates = windowDates('2026-11-04', 30)
    expect(dates).toHaveLength(30)
    expect(dates[0]).toBe('2026-10-06')
    expect(dates[29]).toBe('2026-11-04')
    expect(new Set(dates).size).toBe(30)
  })
})

describe('ratedSymptoms', () => {
  it('orders by severity and drops anything that is not a 1-5 score', () => {
    const rated = ratedSymptoms({
      hot_flashes: 2,
      anxiety: 5,
      fatigue: 0,
      brain_fog: 3.5,
      night_sweats: 'high' as unknown as number,
    })
    expect(rated).toEqual([['anxiety', 5], ['hot_flashes', 2]])
  })

  it('treats a null symptoms column as no symptoms', () => {
    expect(ratedSymptoms(null)).toEqual([])
  })
})

describe('summariseWindow', () => {
  const today = '2026-11-04'

  it('averages only the days that have a value — a gap is not a zero', () => {
    const summary = summariseWindow(
      [
        row('2026-11-04', { mood_score: 4, sleep_hours: 6 }),
        row('2026-11-02', { mood_score: 2, energy_level: 3, sleep_hours: 8 }),
      ],
      today
    )
    expect(summary.daysLogged).toBe(2)
    expect(summary.mood).toEqual({ average: 3, count: 2 })
    expect(summary.energy).toEqual({ average: 3, count: 1 })
    expect(summary.sleep).toEqual({ average: 7, count: 2 })
  })

  it('keeps unlogged days in the series as nulls so the chart shows the gap', () => {
    const summary = summariseWindow([row('2026-11-04', { mood_score: 4 })], today)
    expect(summary.series).toHaveLength(30)
    expect(summary.series[29]).toEqual({ date: today, mood: 4, energy: null, sleep: null })
    expect(summary.series[28].mood).toBeNull()
  })

  it('ignores rows older than the window and rows dated after today', () => {
    const summary = summariseWindow(
      [row('2026-10-05', { mood_score: 1 }), row('2026-11-05', { mood_score: 1 })],
      today
    )
    expect(summary.daysLogged).toBe(0)
    expect(summary.mood.average).toBeNull()
  })

  it('includes the first day of the window', () => {
    expect(summariseWindow([row('2026-10-06', { mood_score: 5 })], today).daysLogged).toBe(1)
  })

  it('accepts sleep hours arriving as a numeric string and rejects impossible values', () => {
    const summary = summariseWindow(
      [
        row('2026-11-04', { sleep_hours: '7.5' as unknown as number }),
        row('2026-11-03', { sleep_hours: 30 }),
      ],
      today
    )
    expect(summary.sleep).toEqual({ average: 7.5, count: 1 })
  })

  it('ranks symptoms by how many days she rated them, then by average severity', () => {
    const summary = summariseWindow(
      [
        row('2026-11-04', { symptoms: { hot_flashes: 2, anxiety: 4 } }),
        row('2026-11-03', { symptoms: { hot_flashes: 4, brain_fog: 5 } }),
        row('2026-11-02', { symptoms: { anxiety: 2 } }),
      ],
      today
    )
    // Frequency beats severity: brain_fog's single 5 ranks below two-day symptoms.
    // anxiety and hot_flashes tie on both, so the key decides — never input order.
    expect(summary.symptoms).toEqual([
      { key: 'anxiety', days: 2, averageSeverity: 3 },
      { key: 'hot_flashes', days: 2, averageSeverity: 3 },
      { key: 'brain_fog', days: 1, averageSeverity: 5 },
    ])
  })
})

describe('groupByMonth', () => {
  it('groups consecutive rows by month without reordering them', () => {
    const groups = groupByMonth([row('2026-11-02'), row('2026-11-01'), row('2026-10-31')])
    expect(groups.map((g) => [g.month, g.rows.length])).toEqual([
      ['2026-11', 2],
      ['2026-10', 1],
    ])
  })
})

describe('parseBeforeCursor', () => {
  it('accepts only a real calendar date', () => {
    expect(parseBeforeCursor('2026-11-01')).toBe('2026-11-01')
    expect(parseBeforeCursor('2026-02-30')).toBeNull()
    expect(parseBeforeCursor("2026-11-01' or 1=1")).toBeNull()
    expect(parseBeforeCursor(['2026-11-01'])).toBeNull()
    expect(parseBeforeCursor(undefined)).toBeNull()
  })
})
