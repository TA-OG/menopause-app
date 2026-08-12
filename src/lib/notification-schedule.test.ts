import { describe, it, expect } from 'vitest'
import { localHourAndDate, truncate, flattenPlan, pickNext } from './notification-schedule'
import type { WellnessRecommendation } from '@/types/database'

function rec(id: string, priority: WellnessRecommendation['priority'] = 'medium'): WellnessRecommendation {
  return { id, title: `Title ${id}`, body: `Body ${id}`, priority, category: 'diet' }
}

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

describe('truncate', () => {
  it('leaves short text untouched', () => {
    expect(truncate('short text')).toBe('short text')
  })

  it('truncates long text and adds an ellipsis', () => {
    const long = 'a'.repeat(200)
    const result = truncate(long, 50)
    expect(result.length).toBe(50)
    expect(result.endsWith('…')).toBe(true)
  })

  it('trims whitespace before measuring length', () => {
    expect(truncate('  padded  ', 20)).toBe('padded')
  })
})

describe('flattenPlan', () => {
  it('combines all four categories into one list, preserving order', () => {
    const plan = {
      diet_adjustments: [rec('d1')],
      lifestyle_adjustments: [rec('l1')],
      mindset_recommendations: [rec('m1')],
      supplement_suggestions: [rec('s1')],
    }
    const result = flattenPlan(plan)
    expect(result.map((r) => r.id)).toEqual(['d1', 'l1', 'm1', 's1'])
  })

  it('returns an empty array for an entirely empty plan', () => {
    const plan = {
      diet_adjustments: [],
      lifestyle_adjustments: [],
      mindset_recommendations: [],
      supplement_suggestions: [],
    }
    expect(flattenPlan(plan)).toEqual([])
  })
})

describe('pickNext', () => {
  it('returns null for an empty candidate list', () => {
    expect(pickNext([], new Map())).toBeNull()
  })

  it('picks a never-sent item over one sent recently', () => {
    const recs = [rec('a'), rec('b')]
    const lastSentAt = new Map([['a', '2026-08-12T10:00:00.000Z']])
    // 'b' has no entry — never sent — so it must win over 'a'.
    expect(pickNext(recs, lastSentAt)?.id).toBe('b')
  })

  it('picks the least-recently-sent item when everything has history', () => {
    const recs = [rec('a'), rec('b'), rec('c')]
    const lastSentAt = new Map([
      ['a', '2026-08-12T10:00:00.000Z'],
      ['b', '2026-08-10T10:00:00.000Z'], // oldest — should win
      ['c', '2026-08-11T10:00:00.000Z'],
    ])
    expect(pickNext(recs, lastSentAt)?.id).toBe('b')
  })

  it('cycles through the whole plan before repeating — property check over many rounds', () => {
    // Simulates the rotation the cron performs day over day: after N picks
    // (N = plan size), every id must have appeared before any repeats.
    const recs = [rec('a'), rec('b'), rec('c'), rec('d')]
    const lastSentAt = new Map<string, string>()
    const order: string[] = []

    for (let day = 0; day < recs.length; day++) {
      const next = pickNext(recs, lastSentAt)
      expect(next).not.toBeNull()
      order.push(next!.id)
      lastSentAt.set(next!.id, new Date(2026, 0, day + 1).toISOString())
    }

    expect(new Set(order).size).toBe(recs.length)
  })
})
