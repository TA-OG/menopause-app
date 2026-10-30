import { describe, it, expect } from 'vitest'
import { JourneyDaySchema, StartJourneySchema, buildJourneyState, decideDay, decideStart } from './journey-api'
import { SESSIONS } from './journey-intake'

const allAnswered = new Set(SESSIONS.flatMap((s) => s.steps.map((st) => st.key)))
const journey = { focus_area: 'rest' as const, started_on: '2026-11-01' }

describe('schemas', () => {
  it('a day must say something', () => {
    expect(JourneyDaySchema.safeParse({ today: '2026-11-01' }).success).toBe(false)
    expect(JourneyDaySchema.safeParse({ today: '2026-11-01', feeling: 'hard' }).success).toBe(true)
    expect(JourneyDaySchema.safeParse({ today: '2026-11-01', feeling: 'fine' }).success).toBe(false)
    expect(JourneyDaySchema.safeParse({ today: '2026-11-01', invitation_outcome: 'done' }).success).toBe(true)
  })

  it('start needs a date and an area', () => {
    expect(StartJourneySchema.safeParse({ focus_area: 'rest', today: '2026-11-01' }).success).toBe(true)
    expect(StartJourneySchema.safeParse({ focus_area: 'rest', today: 'today' }).success).toBe(false)
  })
})

describe('decideStart', () => {
  const signals = { symptoms: ['sleep_problems', 'hot_flashes'] }

  it('only after her questions are done', () => {
    expect(decideStart(signals, new Set(['symptoms']), 'rest')).toMatchObject({ ok: false, status: 409 })
  })

  it('only with an area she is offered', () => {
    expect(decideStart(signals, allAnswered, 'rest')).toEqual({ ok: true, focusArea: 'rest' })
    expect(decideStart(signals, allAnswered, 'intimacy')).toMatchObject({ ok: false, status: 400 })
    expect(decideStart(signals, allAnswered, 'myself_again')).toMatchObject({ ok: false, status: 400 })
    expect(decideStart(signals, allAnswered, '__proto__')).toMatchObject({ ok: false, status: 400 })
  })
})

describe('decideDay', () => {
  it('works out the invitation from her start date, never the request', () => {
    expect(decideDay(journey, [], { today: '2026-11-03', invitation_outcome: 'done' })).toEqual({
      ok: true,
      row: { day: '2026-11-03', invitation_id: 'feel_safe_2', invitation_outcome: 'done' },
    })
  })

  it('refuses an invitation answer after Feel Safe', () => {
    expect(decideDay(journey, [], { today: '2026-11-09', invitation_outcome: 'done' })).toMatchObject({
      ok: false,
      status: 409,
    })
  })

  it('a feeling alone is fine on any day of the journey', () => {
    expect(decideDay(journey, [], { today: '2026-12-01', feeling: 'good' })).toEqual({
      ok: true,
      row: { day: '2026-12-01', feeling: 'good' },
    })
  })

  it('refuses a day before she started', () => {
    expect(decideDay(journey, [], { today: '2026-10-31', feeling: 'good' })).toMatchObject({ ok: false })
  })
})

describe('buildJourneyState', () => {
  const base = {
    name: 'Ade',
    signals: { symptoms: ['sleep_problems'], primary_symptom: 'sleep_problems' },
    answers: [] as { question_key: string; answer_value: string }[],
    isPremium: false,
    journey: null,
    weeks: [],
    foundationsStarted: false,
    days: [],
    today: '2026-11-01',
  }

  it('before the questions: the first session, no position', () => {
    expect(buildJourneyState(base)).toMatchObject({ nextSession: 'feeling', journey: null, position: null })
  })

  it('reflects back only the answers Mel uses', () => {
    const s = buildJourneyState({
      ...base,
      answers: [
        { question_key: 'sleep_quality', answer_value: 'poor' },
        { question_key: 'medical_flags', answer_value: 'on_hrt' },
        { question_key: 'heritage', answer_value: 'yoruba' },
      ],
    })
    expect(s.reflected).toEqual({ sleep_quality: 'poor' })
  })

  it("shows the safety line when she said she's really struggling", () => {
    const s = buildJourneyState({
      ...base,
      answers: [{ question_key: 'how_are_you', answer_value: 'really_struggling' }],
    })
    expect(s.showSignpost).toBe(true)
  })

  it("today's answer and position once started", () => {
    const s = buildJourneyState({
      ...base,
      journey,
      today: '2026-11-03',
      days: [
        { day: '2026-11-03', feeling: 'hard', invitation_id: null, invitation_outcome: null },
        { day: '2026-11-02', feeling: 'hard', invitation_id: null, invitation_outcome: null },
        { day: '2026-11-01', feeling: 'hard', invitation_id: null, invitation_outcome: null },
      ],
    })
    expect(s.position).toMatchObject({ stage: 'feel_safe', day: 3 })
    expect(s.today?.feeling).toBe('hard')
    expect(s.showSignpost).toBe(true)
  })
})
