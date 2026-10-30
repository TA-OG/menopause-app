import { describe, it, expect } from 'vitest'
import { STEPS, collectedKeys } from './onboarding-config'
import {
  JOURNEY_NEW_STEPS,
  SESSIONS,
  firstUnansweredStep,
  journeyQuestionKeys,
  nextSession,
} from './journey-intake'

type Keyed = Extract<(typeof STEPS)[number], { key: string }>
const wizard = (key: string) => STEPS.find((s): s is Keyed => 'key' in s && s.key === key)

describe('journey intake asks what the wizard asks', () => {
  it('asks every wizard question except the name, which the welcome asks', () => {
    const asked = new Set(journeyQuestionKeys())
    const missing = collectedKeys().filter((k) => k !== 'full_name' && !asked.has(k))
    expect(missing, `journey never asks: ${missing.join(', ')}`).toEqual([])
  })

  it('asks each question once', () => {
    const keys = journeyQuestionKeys()
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('keeps every answer value of an existing question (the engine matches values)', () => {
    for (const session of SESSIONS) {
      for (const step of session.steps) {
        const original = wizard(step.key)
        if (!original || !('choices' in original) || !original.choices) continue
        if (!('choices' in step) || !step.choices) throw new Error(`${step.key} lost its choices`)
        expect(step.choices.map((c) => c.value), step.key).toEqual(original.choices.map((c) => c.value))
        expect(step.choices.map((c) => !!c.exclusive), step.key).toEqual(
          original.choices.map((c) => !!c.exclusive)
        )
      }
    }
  })

  it('keeps derived choices (which symptom weighs most comes from her symptoms)', () => {
    const step = SESSIONS[0].steps.find((s) => s.key === 'primary_symptom')
    expect(step && 'choicesFrom' in step && typeof step.choicesFrom).toBe('function')
  })

  it('new questions do not collide with the wizard', () => {
    const existing = new Set(collectedKeys())
    for (const s of JOURNEY_NEW_STEPS) expect(existing.has(s.key), s.key).toBe(false)
  })

  it('every multi-select needs an answer, and has an explicit "none"', () => {
    for (const session of SESSIONS) {
      for (const step of session.steps) {
        if (step.kind !== 'multi') continue
        expect(step.minSelect ?? 0, step.key).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it('asks the safety questions together, and never as optional', () => {
    const safe = SESSIONS.find((s) => s.id === 'safe')
    expect(safe?.optional).toBe(false)
    expect(safe?.steps.map((s) => s.key)).toEqual(['medical_flags', 'diet_restrictions'])
  })

  it('asks "How often do you have an alcoholic drink?" (Pamela: "It should alcohol")', () => {
    const step = SESSIONS.flatMap((s) => s.steps).find((s) => s.key === 'alcohol_intake')
    expect(step?.title).toMatch(/alcoholic drink/)
  })

  it('only heritage is optional (special-category data)', () => {
    expect(SESSIONS.filter((s) => s.optional).map((s) => s.id)).toEqual(['heritage'])
  })
})

describe('picking up where she left off', () => {
  const keysOf = (ids: string[]) =>
    new Set(SESSIONS.filter((s) => ids.includes(s.id)).flatMap((s) => s.steps.map((st) => st.key)))

  it('starts at the first session', () => {
    expect(nextSession(new Set())).toBe('feeling')
  })

  it('resumes at the first unfinished session', () => {
    expect(nextSession(keysOf(['feeling', 'rest']))).toBe('connection')
  })

  it('a half-finished session resumes mid-way', () => {
    const answered = new Set(['how_are_you', 'symptoms'])
    expect(nextSession(answered)).toBe('feeling')
    expect(firstUnansweredStep(SESSIONS[0], answered)).toBe(2)
  })

  it('is done when every required session is answered, heritage or not', () => {
    expect(nextSession(keysOf(['feeling', 'rest', 'connection', 'you', 'day_to_day', 'safe']))).toBeNull()
  })

  it('never skips the safety session', () => {
    expect(nextSession(keysOf(['feeling', 'rest', 'connection', 'you', 'day_to_day']))).toBe('safe')
  })
})
