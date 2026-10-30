import { describe, it, expect } from 'vitest'
import type { FocusWeek } from '@/types/database'
import {
  FEEL_SAFE_DAYS,
  FOCUS_AREAS,
  HARD_DAYS_BEFORE_SIGNPOST,
  JOURNEY_LAUNCHED,
  SUPPORT_AFTER_REVIEWED_WEEKS,
  heardPhrases,
  journeyLaunchBlockers,
  journeyPosition,
  journeyVisibleTo,
  offeredFocusAreas,
  programmeSymptoms,
  reviewedFoundationWeeks,
  showSafetySignpost,
  suggestedFocusArea,
} from './journey'
import {
  FEEL_SAFE_INVITATIONS,
  PATH,
  SAFETY_SIGNPOST,
  allJourneyCopy,
  fill,
} from './journey-copy'
import { SYMPTOM_KEYS } from './checkin-schema'

const week = (kind: FocusWeek['kind'], outcome: FocusWeek['outcome']) => ({ kind, outcome })

describe('agreed numbers', () => {
  it('match the decisions', () => {
    expect(FEEL_SAFE_DAYS).toBe(7)
    // Pamela: "6 or 8 weeks. 4 weeks isn't long enough"; 8 chosen 30 Oct 2026.
    expect(SUPPORT_AFTER_REVIEWED_WEEKS).toBe(8)
  })

  it('Feel Safe is three invitations, not one a day (decision 4)', () => {
    expect(FEEL_SAFE_INVITATIONS).toHaveLength(3)
    const days = FEEL_SAFE_INVITATIONS.map((i) => i.opensOnDay)
    expect(days[0]).toBe(1)
    expect(days.every((d) => d >= 1 && d <= FEEL_SAFE_DAYS)).toBe(true)
    expect([...days].sort((a, b) => a - b)).toEqual(days)
  })
})

describe('focus areas', () => {
  it('only names real symptoms', () => {
    for (const a of FOCUS_AREAS) for (const s of a.symptoms) expect(SYMPTOM_KEYS).toContain(s)
  })

  it('never offers an area without approved content (decision 7)', () => {
    const everything = { symptoms: SYMPTOM_KEYS.filter((k) => k !== 'other') }
    const offered = offeredFocusAreas(everything).map((a) => a.id)
    expect(offered).not.toContain('myself_again')
    expect(offered).not.toContain('less_alone')
  })

  it('offers only areas built from symptoms she told us about', () => {
    expect(offeredFocusAreas({ symptoms: ['hot_flashes'] }).map((a) => a.id)).toEqual(['cooler'])
    expect(offeredFocusAreas({ symptoms: [] })).toEqual([])
  })

  it('suggests the area holding the symptom that weighs most', () => {
    const s = { symptoms: ['hot_flashes', 'brain_fog'], primary_symptom: 'brain_fog' }
    expect(suggestedFocusArea(s)?.id).toBe('clearer_head')
  })

  it('falls back to the first area offered, or none', () => {
    expect(suggestedFocusArea({ symptoms: ['joint_pain'], primary_symptom: '' })?.id).toBe('comfortable_body')
    expect(suggestedFocusArea({ symptoms: [], primary_symptom: undefined })).toBeNull()
  })

  it('gives the weekly programme only her own symptoms, 1–3 of them', () => {
    const rest = FOCUS_AREAS.find((a) => a.id === 'rest')!
    expect(programmeSymptoms(rest, { symptoms: ['fatigue', 'anxiety'] })).toEqual(['fatigue'])
    for (const a of FOCUS_AREAS.filter((x) => x.available)) {
      const all = programmeSymptoms(a, { symptoms: SYMPTOM_KEYS as unknown as string[] })
      expect(all.length).toBeGreaterThanOrEqual(1)
      expect(all.length).toBeLessThanOrEqual(3)
    }
  })
})

describe('journeyPosition', () => {
  it('days 1–7 are Feel Safe, with the latest invitation reached', () => {
    expect(journeyPosition('2026-11-01', '2026-11-01', [])).toMatchObject({ stage: 'feel_safe', day: 1 })
    expect(journeyPosition('2026-11-01', '2026-11-01', []).invitation?.id).toBe('feel_safe_1')
    expect(journeyPosition('2026-11-01', '2026-11-02', []).invitation?.id).toBe('feel_safe_1')
    expect(journeyPosition('2026-11-01', '2026-11-03', []).invitation?.id).toBe('feel_safe_2')
    expect(journeyPosition('2026-11-01', '2026-11-07', [])).toMatchObject({ stage: 'feel_safe', day: 7 })
    expect(journeyPosition('2026-11-01', '2026-11-07', []).invitation?.id).toBe('feel_safe_3')
  })

  it('Foundations from day 8', () => {
    expect(journeyPosition('2026-11-01', '2026-11-08', [])).toMatchObject({
      stage: 'foundations',
      day: 8,
      invitation: null,
    })
  })

  it('an unreadable date keeps her in Feel Safe, never moves her on', () => {
    expect(journeyPosition('nonsense', '2026-11-30', []).stage).toBe('feel_safe')
  })

  it('counts only reviewed change weeks toward Support', () => {
    const weeks = [
      week('change', 'kept'),
      week('change', 'stopped'),
      week('change', 'swapped'),
      week('rest', 'rested'),
      week('change', null),
    ]
    expect(reviewedFoundationWeeks(weeks)).toBe(2)
  })

  it('keeps Support closed while its wording is pending, however long she has been going', () => {
    expect(PATH.supportOpener.status).toBe('pending')
    const many = Array.from({ length: 20 }, () => week('change', 'kept'))
    const p = journeyPosition('2026-01-01', '2026-11-30', many)
    expect(p).toMatchObject({ stage: 'foundations', supportOpen: false, reviewedWeeks: 20 })
  })
})

describe('safety signpost', () => {
  const day = (date: string, feeling: 'good' | 'up_and_down' | 'hard') => ({ date, feeling })

  it(`shows after ${HARD_DAYS_BEFORE_SIGNPOST} hard mornings in a row, today included`, () => {
    const run = [day('2026-11-10', 'hard'), day('2026-11-09', 'hard'), day('2026-11-08', 'hard')]
    expect(showSafetySignpost(run, '2026-11-10')).toBe(true)
    expect(showSafetySignpost(run.slice(0, 2), '2026-11-10')).toBe(false)
  })

  it('a better morning, or a gap, breaks the run', () => {
    expect(
      showSafetySignpost([day('2026-11-10', 'hard'), day('2026-11-09', 'good'), day('2026-11-08', 'hard')], '2026-11-10')
    ).toBe(false)
    expect(
      showSafetySignpost([day('2026-11-10', 'hard'), day('2026-11-09', 'hard'), day('2026-11-07', 'hard')], '2026-11-10')
    ).toBe(false)
  })

  it('needs today to be hard: old hard days alone do not show it', () => {
    expect(
      showSafetySignpost([day('2026-11-09', 'hard'), day('2026-11-08', 'hard'), day('2026-11-07', 'hard')], '2026-11-10')
    ).toBe(false)
  })

  it('shows at once when she said she is really struggling or does not know any more', () => {
    expect(showSafetySignpost([], '2026-11-10', 'really_struggling')).toBe(true)
    expect(showSafetySignpost([], '2026-11-10', 'dont_know')).toBe(true)
    expect(showSafetySignpost([], '2026-11-10', 'coping')).toBe(false)
  })

  it('carries the checked Samaritans number', () => {
    expect(SAFETY_SIGNPOST.text).toContain('116 123')
    expect(SAFETY_SIGNPOST.text).toMatch(/GP/)
  })
})

describe('what Mel says she heard', () => {
  it('only what her answers support', () => {
    const texts = (m: Record<string, string>) => heardPhrases(new Map(Object.entries(m))).map((l) => l.text)
    expect(texts({})).toEqual([])
    expect(texts({ sleep_quality: 'very_poor', stress_level: 'low', self_image: 'still_me' })).toEqual([
      'The broken nights.',
    ])
    expect(texts({ sleep_quality: 'good', stress_level: 'very_high', self_image: 'stranger' })).toEqual([
      'Feeling stretched thin.',
      'Not quite recognising yourself.',
    ])
  })
})

describe('copy', () => {
  it('fills a name, and drops it cleanly when there is none', () => {
    expect(fill('Thank you, {name}. Lovely.', { name: 'Ade' })).toBe('Thank you, Ade. Lovely.')
    expect(fill('Thank you, {name}. Lovely.', { name: '' })).toBe('Thank you. Lovely.')
    expect(fill('How are you, really, {name}?', {})).toBe('How are you, really?')
    expect(fill('Start with: {focus}.', { focus: 'Better rest' })).toBe('Start with: Better rest.')
  })

  it('never calls Mel a clinician or a specialist, and names Pamela as she asked', () => {
    for (const l of allJourneyCopy()) {
      expect(l.text, l.source).not.toMatch(/menopause specialist/i)
      expect(l.text, l.source).not.toMatch(/\bI'?m (a|your) (doctor|nurse|clinician)\b/i)
    }
  })

  it('has no "love" where Pamela took it out', () => {
    expect(FEEL_SAFE_INVITATIONS.map((i) => i.says.text).join(' ')).not.toMatch(/\blove\b/)
  })

  it('every line says where it came from', () => {
    for (const l of allJourneyCopy()) expect(l.source.length).toBeGreaterThan(0)
  })
})

describe('launch gate', () => {
  it('is closed to women while anything it shows is pending or redrafted', () => {
    expect(journeyLaunchBlockers().length).toBeGreaterThan(0)
    expect(journeyVisibleTo({ isAdmin: false })).toBe(false)
  })

  it('is always open to admins, so Pamela can review it in the app', () => {
    expect(journeyVisibleTo({ isAdmin: true })).toBe(true)
  })

  it('cannot be switched on while a blocker remains', () => {
    if (JOURNEY_LAUNCHED) expect(journeyLaunchBlockers()).toEqual([])
  })

  it('blocks on the Feel Safe redraft and the safety line', () => {
    const blocked = new Set(journeyLaunchBlockers())
    expect(blocked.has(SAFETY_SIGNPOST)).toBe(true)
    expect(blocked.has(FEEL_SAFE_INVITATIONS[0].invitation)).toBe(true)
  })
})
