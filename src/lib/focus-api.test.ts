import { describe, it, expect } from 'vitest'
import {
  FocusCheckinSchema,
  OpenWeekSchema,
  ReviewWeekSchema,
  StartProgrammeSchema,
  buildFocusState,
  chooseWeekChange,
  decideFocusCheckin,
  decideReview,
  decideWeekStart,
  describeIssues,
  focusRatings,
  isPlausibleLocalToday,
  parseFocusParam,
  utcCalendarDate,
  weekView,
  type FocusStateInput,
} from './focus-api'
import { selectWeeklyChange } from './focus-programme'
import type {
  FocusProgramme,
  FocusWeek,
  UserSignals,
  WellnessRecommendation,
} from '@/types/database'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function signals(overrides: Partial<UserSignals> = {}): UserSignals {
  return {
    symptoms: ['hot_flashes', 'sleep_problems', 'anxiety', 'fatigue'],
    primary_symptom: 'sleep_problems',
    diet_restrictions: [],
    medical_flags: [],
    previously_tried: [],
    ...overrides,
  }
}

function rec(
  id: string,
  category: WellnessRecommendation['category'],
  targets: string[]
): WellnessRecommendation {
  return { id, title: `Title ${id}`, body: `Body ${id}`, priority: 'medium', category, targets_symptoms: targets }
}

function plan(recs: WellnessRecommendation[]) {
  return {
    diet_adjustments: recs.filter((r) => r.category === 'diet'),
    lifestyle_adjustments: recs.filter((r) => r.category === 'lifestyle'),
    mindset_recommendations: recs.filter((r) => r.category === 'mindset'),
    supplement_suggestions: recs.filter((r) => r.category === 'supplement'),
  }
}

function week(sequence: number, overrides: Partial<FocusWeek> = {}): FocusWeek {
  return {
    id: `00000000-0000-4000-8000-00000000000${sequence}`,
    programme_id: 'p1',
    user_id: 'u1',
    sequence,
    recommendation_id: `r${sequence}`,
    recommendation_snapshot: { title: 't', body: 'b', category: 'diet', targets_symptoms: [] },
    covers_symptoms: [],
    starts_on: '2026-10-01',
    outcome: null,
    reviewed_at: null,
    released_on: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

const kept = (seq: number, o: Partial<FocusWeek> = {}) =>
  week(seq, { outcome: 'kept', reviewed_at: 'x', ...o })

const programme: FocusProgramme = {
  id: 'p1',
  user_id: 'u1',
  focus_symptoms: ['sleep_problems', 'anxiety'],
  status: 'active',
  started_on: '2026-10-01',
  ended_at: null,
  created_at: '',
  updated_at: '',
}

// ─── Dates ────────────────────────────────────────────────────────────────────

describe('isPlausibleLocalToday', () => {
  const now = new Date('2026-10-09T12:00:00Z')

  it('accepts the UTC date and one day either side (UTC−12 … UTC+14)', () => {
    expect(isPlausibleLocalToday('2026-10-08', now)).toBe(true)
    expect(isPlausibleLocalToday('2026-10-09', now)).toBe(true)
    expect(isPlausibleLocalToday('2026-10-10', now)).toBe(true)
  })

  it('refuses anything further away — a backdated week would open its review early', () => {
    expect(isPlausibleLocalToday('2026-10-07', now)).toBe(false)
    expect(isPlausibleLocalToday('2026-10-11', now)).toBe(false)
  })

  it('refuses malformed and impossible dates', () => {
    expect(isPlausibleLocalToday('', now)).toBe(false)
    expect(isPlausibleLocalToday('2026-02-30', now)).toBe(false)
    expect(isPlausibleLocalToday('09/10/2026', now)).toBe(false)
  })

  it('utcCalendarDate is the UTC date, not the server-local one', () => {
    expect(utcCalendarDate(new Date('2026-10-09T23:30:00Z'))).toBe('2026-10-09')
  })
})

describe('decideWeekStart', () => {
  it('allows the first week on any date', () => {
    expect(decideWeekStart([], '2026-10-09').ok).toBe(true)
  })

  it('allows the same day or later than the latest week', () => {
    const weeks = [kept(1, { starts_on: '2026-10-01' }), week(2, { starts_on: '2026-10-08', outcome: 'stopped', reviewed_at: 'x' })]
    expect(decideWeekStart(weeks, '2026-10-08').ok).toBe(true)
    expect(decideWeekStart(weeks, '2026-10-09').ok).toBe(true)
  })

  it('refuses a week dated before the one it follows', () => {
    const weeks = [week(1, { starts_on: '2026-10-08', outcome: 'swapped', reviewed_at: 'x' })]
    expect(decideWeekStart(weeks, '2026-10-07')).toMatchObject({ ok: false, status: 400 })
  })
})

// ─── Request bodies ───────────────────────────────────────────────────────────

describe('request schemas', () => {
  it('StartProgrammeSchema rejects unknown symptoms and bad dates', () => {
    expect(StartProgrammeSchema.safeParse({ focus_symptoms: ['anxiety'], today: '2026-10-09' }).success).toBe(true)
    expect(StartProgrammeSchema.safeParse({ focus_symptoms: ['not_a_symptom'], today: '2026-10-09' }).success).toBe(false)
    expect(StartProgrammeSchema.safeParse({ focus_symptoms: [], today: '2026-10-09' }).success).toBe(false)
    expect(StartProgrammeSchema.safeParse({ focus_symptoms: ['anxiety'], today: 'today' }).success).toBe(false)
  })

  it('OpenWeekSchema makes recommendation_id optional', () => {
    expect(OpenWeekSchema.safeParse({ today: '2026-10-09' }).success).toBe(true)
    expect(OpenWeekSchema.safeParse({ today: '2026-10-09', recommendation_id: '' }).success).toBe(false)
  })

  it('ReviewWeekSchema defaults release_week_ids and requires uuids', () => {
    const ok = ReviewWeekSchema.safeParse({ today: '2026-10-09', outcome: 'kept' })
    expect(ok.success && ok.data.release_week_ids).toEqual([])
    expect(ReviewWeekSchema.safeParse({ today: '2026-10-09', outcome: 'kept', release_week_ids: ['x'] }).success).toBe(false)
    expect(ReviewWeekSchema.safeParse({ today: '2026-10-09', outcome: 'maybe' }).success).toBe(false)
  })

  it('FocusCheckinSchema only accepts whole ratings 1–5 for real symptoms', () => {
    const base = { checkin_date: '2026-10-09' }
    expect(FocusCheckinSchema.safeParse({ ...base, ratings: { anxiety: 3 } }).success).toBe(true)
    expect(FocusCheckinSchema.safeParse({ ...base, ratings: { anxiety: 0 } }).success).toBe(false)
    expect(FocusCheckinSchema.safeParse({ ...base, ratings: { anxiety: 2.5 } }).success).toBe(false)
    expect(FocusCheckinSchema.safeParse({ ...base, ratings: { made_up: 3 } }).success).toBe(false)
  })

  it('describeIssues never includes the rejected value (health data)', () => {
    const r = FocusCheckinSchema.safeParse({ checkin_date: '2026-10-09', ratings: { anxiety: 987654 } })
    expect(r.success).toBe(false)
    if (!r.success) {
      const text = describeIssues(r.error)
      expect(text).toContain('ratings.anxiety')
      expect(text).not.toContain('987654')
    }
  })
})

describe('parseFocusParam', () => {
  it('splits, trims and drops empties', () => {
    expect(parseFocusParam(' anxiety, ,sleep_problems ')).toEqual(['anxiety', 'sleep_problems'])
    expect(parseFocusParam(null)).toEqual([])
    expect(parseFocusParam('')).toEqual([])
  })

  it('caps the number of entries', () => {
    expect(parseFocusParam(Array(50).fill('a').join(','))).toHaveLength(10)
  })
})

// ─── Decisions ────────────────────────────────────────────────────────────────

describe('chooseWeekChange', () => {
  const s = signals()
  const selection = selectWeeklyChange(
    plan([
      rec('a', 'lifestyle', ['sleep_problems', 'anxiety']),
      rec('b', 'diet', ['sleep_problems']),
      rec('c', 'mindset', ['anxiety']),
      rec('d', 'diet', ['anxiety']),
      rec('supp', 'supplement', ['sleep_problems', 'anxiety']),
    ]),
    ['sleep_problems', 'anxiety'],
    s
  )

  it('defaults to the pick', () => {
    expect(chooseWeekChange(selection)).toMatchObject({ ok: true, choice: { rec: { id: 'a' } } })
  })

  it('accepts an offered alternative', () => {
    const alt = selection.alternatives[0].rec.id
    expect(chooseWeekChange(selection, alt)).toMatchObject({ ok: true, choice: { rec: { id: alt } } })
  })

  it('refuses a card that was not offered — including a supplement', () => {
    const offered = new Set([selection.pick!.rec.id, ...selection.alternatives.map((a) => a.rec.id)])
    const notOffered = ['a', 'b', 'c', 'd'].find((id) => !offered.has(id))!
    expect(chooseWeekChange(selection, notOffered)).toMatchObject({ ok: false, status: 400 })
    expect(chooseWeekChange(selection, 'supp')).toMatchObject({ ok: false, status: 400 })
  })

  it('409 when nothing matches her focus', () => {
    const empty = selectWeeklyChange(plan([]), ['anxiety'], s)
    expect(chooseWeekChange(empty)).toMatchObject({ ok: false, status: 409 })
  })
})

describe('decideReview', () => {
  const input = (o: Partial<Parameters<typeof decideReview>[1]> = {}) => ({
    today: '2026-10-08',
    outcome: 'kept' as const,
    release_week_ids: [] as string[],
    ...o,
  })

  it('409 when no week is open', () => {
    expect(decideReview([kept(1)], input())).toMatchObject({ ok: false, status: 409 })
  })

  it('kept and stopped only from day 7', () => {
    const weeks = [week(1, { starts_on: '2026-10-01' })]
    expect(decideReview(weeks, input({ today: '2026-10-07' }))).toMatchObject({ ok: false, status: 409 })
    expect(decideReview(weeks, input({ today: '2026-10-07', outcome: 'stopped' }))).toMatchObject({ ok: false })
    expect(decideReview(weeks, input({ today: '2026-10-08' }))).toMatchObject({ ok: true })
  })

  it('swapped any time, including day one', () => {
    const weeks = [week(1, { starts_on: '2026-10-08' })]
    expect(decideReview(weeks, input({ outcome: 'swapped' }))).toMatchObject({ ok: true })
  })

  it('refuses a keep that would put 4 changes on her check-in', () => {
    const weeks = [kept(1), kept(2), week(3)]
    expect(decideReview(weeks, input())).toMatchObject({ ok: false, status: 409 })
    // Stopping is fine — it adds nothing to her check-in.
    expect(decideReview(weeks, input({ outcome: 'stopped' }))).toMatchObject({ ok: true })
  })

  it('allows the keep once she releases one', () => {
    const weeks = [kept(1), kept(2), week(3)]
    const decision = decideReview(weeks, input({ release_week_ids: [weeks[0].id] }))
    expect(decision).toMatchObject({ ok: true, releaseIds: [weeks[0].id] })
  })

  it('refuses releasing anything that is not a currently kept change', () => {
    const weeks = [kept(1, { released_on: '2026-10-05' }), week(2, { outcome: 'stopped', reviewed_at: 'x' }), week(3)]
    for (const id of [weeks[0].id, weeks[1].id, weeks[2].id, '00000000-0000-4000-8000-999999999999']) {
      expect(decideReview(weeks, input({ release_week_ids: [id] }))).toMatchObject({ ok: false, status: 400 })
    }
  })

  it('collapses duplicate release ids', () => {
    const weeks = [kept(1), week(2)]
    const d = decideReview(weeks, input({ release_week_ids: [weeks[0].id, weeks[0].id] }))
    expect(d.ok && d.releaseIds).toEqual([weeks[0].id])
  })
})

describe('decideFocusCheckin', () => {
  const weeks = [kept(1), week(2, { outcome: 'stopped', reviewed_at: 'x' }), week(3)]

  it('accepts ratings for focus symptoms and answers for changes on her check-in', () => {
    expect(
      decideFocusCheckin(programme, weeks, { ratings: { anxiety: 2 }, done: ['r3'], not_done: ['r1'] })
    ).toMatchObject({ ok: true })
  })

  it('refuses a rating for a symptom she is not focusing on', () => {
    expect(
      decideFocusCheckin(programme, weeks, { ratings: { hot_flashes: 2 }, done: [], not_done: [] })
    ).toMatchObject({ ok: false, status: 400 })
  })

  it('refuses answers for a change not on her check-in (stopped, or never started)', () => {
    for (const id of ['r2', 'r99']) {
      expect(decideFocusCheckin(programme, weeks, { ratings: {}, done: [id], not_done: [] })).toMatchObject({ ok: false })
      expect(decideFocusCheckin(programme, weeks, { ratings: {}, done: [], not_done: [id] })).toMatchObject({ ok: false })
    }
  })

  it('refuses the same change as both done and not done', () => {
    expect(
      decideFocusCheckin(programme, weeks, { ratings: {}, done: ['r3'], not_done: ['r3'] })
    ).toMatchObject({ ok: false, status: 400 })
  })

  it('refuses an empty check-in', () => {
    expect(decideFocusCheckin(programme, weeks, { ratings: {}, done: [], not_done: [] })).toMatchObject({ ok: false })
  })
})

// ─── Read model ───────────────────────────────────────────────────────────────

describe('focusRatings', () => {
  it('returns only her focus symptoms, never the rest of the day', () => {
    expect(
      focusRatings({ anxiety: 2, hot_flashes: 4, sleep_problems: 'x' }, ['anxiety', 'sleep_problems'])
    ).toEqual({ anxiety: 2 })
    expect(focusRatings(null, ['anxiety'])).toEqual({})
  })
})

describe('weekView', () => {
  it('reads the card from her CURRENT plan, and null when it has left the plan', () => {
    const current = rec('r1', 'diet', ['anxiety'])
    const byId = new Map([['r1', current]])
    expect(weekView(week(1), byId, '2026-10-08')).toMatchObject({ current, dayIndex: 7, reviewDue: true })
    expect(weekView(week(1), new Map(), '2026-10-02')).toMatchObject({ current: null, dayIndex: 1, reviewDue: false })
  })

  it('a reviewed week is never review-due', () => {
    expect(weekView(kept(1), new Map(), '2026-12-01').reviewDue).toBe(false)
  })
})

describe('buildFocusState', () => {
  const recs = [
    rec('r1', 'diet', ['anxiety']),
    rec('r2', 'lifestyle', ['sleep_problems']),
    rec('r3', 'mindset', ['sleep_problems', 'anxiety']),
    rec('r4', 'diet', ['anxiety']),
  ]
  const base = (o: Partial<FocusStateInput> = {}): FocusStateInput => ({
    signals: signals(),
    plan: plan(recs),
    planById: new Map(recs.map((r) => [r.id, r])),
    programme: null,
    weeks: [],
    today: '2026-10-09',
    previewFocus: null,
    checkins: [],
    ...o,
  })

  it('without a programme: options from intake, primary first; no preview unless asked', () => {
    const s = buildFocusState(base())
    expect(s).toMatchObject({ state: 'none', preview: null })
    expect(s.options[0]).toBe('sleep_problems')
  })

  it('previews week 1 for the requested focus', () => {
    const s = buildFocusState(base({ previewFocus: ['sleep_problems', 'anxiety'] }))
    expect(s.state === 'none' && s.preview?.pick?.rec.id).toBe('r3')
  })

  it('with an open week: current, kept, no next choice, ratings for this week only', () => {
    const weeks = [kept(1), week(3, { starts_on: '2026-10-05' })]
    const s = buildFocusState(
      base({
        programme,
        weeks,
        checkins: [
          { checkin_date: '2026-10-09', symptoms: { anxiety: 2, hot_flashes: 5 }, tried_today: ['r3', 'r1', 'unrelated'] },
          { checkin_date: '2026-10-04', symptoms: { anxiety: 4 }, tried_today: [] },
          { checkin_date: '2026-10-06', symptoms: { sleep_problems: 3 }, tried_today: null },
        ],
      })
    )
    if (s.state !== 'active') throw new Error('expected active')
    expect(s.current?.week.id).toBe(weeks[1].id)
    expect(s.kept.map((k) => k.week.id)).toEqual([weeks[0].id])
    expect(s.next).toBeNull()
    expect(s.todayCheckin).toEqual({ ratings: { anxiety: 2 }, done: ['r3', 'r1'] })
    expect(s.weekRatings).toEqual([
      { date: '2026-10-06', ratings: { sleep_problems: 3 } },
      { date: '2026-10-09', ratings: { anxiety: 2 } },
    ])
  })

  it('after a review: offers the next change, never one already used', () => {
    const weeks = [kept(1), week(2, { recommendation_id: 'r3', outcome: 'stopped', reviewed_at: 'x' })]
    const s = buildFocusState(base({ programme, weeks }))
    if (s.state !== 'active') throw new Error('expected active')
    expect(s.current).toBeNull()
    const offered = [s.next?.pick?.rec.id, ...(s.next?.alternatives ?? []).map((a) => a.rec.id)]
    expect(offered).not.toContain('r1')
    expect(offered).not.toContain('r3')
    expect(s.weekRatings).toEqual([])
    expect(s.todayCheckin).toBeNull()
  })

  it('reports whether the open week can be kept without a release', () => {
    const roomy = buildFocusState(base({ programme, weeks: [kept(1), week(2)] }))
    const full = buildFocusState(base({ programme, weeks: [kept(1), kept(2), week(3)] }))
    expect(roomy.state === 'active' && roomy.canKeepWithoutRelease).toBe(true)
    expect(full.state === 'active' && full.canKeepWithoutRelease).toBe(false)
  })
})
