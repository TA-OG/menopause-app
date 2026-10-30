import { describe, it, expect } from 'vitest'
import { validateAnswerUpdate } from './onboarding-answers'

describe('validateAnswerUpdate', () => {
  it('refuses a key we never ask', () => {
    expect(validateAnswerUpdate('favourite_colour', ['blue'])).toMatchObject({ ok: false })
    expect(validateAnswerUpdate('__proto__', ['x'])).toMatchObject({ ok: false })
  })

  it('safety questions: required, from the list, "none" alone', () => {
    expect(validateAnswerUpdate('medical_flags', [])).toMatchObject({ ok: false })
    expect(validateAnswerUpdate('medical_flags', ['none'])).toMatchObject({ ok: true, values: ['none'] })
    expect(validateAnswerUpdate('medical_flags', ['on_hrt', 'thyroid'])).toMatchObject({ ok: true })
    expect(validateAnswerUpdate('medical_flags', ['none', 'on_hrt'])).toMatchObject({ ok: false })
    expect(validateAnswerUpdate('medical_flags', ['something_else'])).toMatchObject({ ok: false })

    expect(validateAnswerUpdate('diet_restrictions', [])).toMatchObject({ ok: false })
    expect(validateAnswerUpdate('diet_restrictions', ['none'])).toMatchObject({ ok: true })
    expect(validateAnswerUpdate('diet_restrictions', ['none', 'vegan'])).toMatchObject({ ok: false })
    expect(validateAnswerUpdate('diet_restrictions', ['vegan', 'nut_allergy'])).toMatchObject({ ok: true })
  })

  it('single choice: exactly one known value', () => {
    expect(validateAnswerUpdate('alcohol_intake', ['occasional'])).toMatchObject({ ok: true })
    expect(validateAnswerUpdate('alcohol_intake', ['occasional', 'regular'])).toMatchObject({ ok: false })
    expect(validateAnswerUpdate('alcohol_intake', ['lots'])).toMatchObject({ ok: false })
  })

  it('collapses duplicates and blank values', () => {
    expect(validateAnswerUpdate('symptoms', ['fatigue', 'fatigue', ' ', 'anxiety'])).toMatchObject({
      ok: true,
      values: ['fatigue', 'anxiety'],
    })
  })

  it('heritage and country are optional and always clearable', () => {
    expect(validateAnswerUpdate('heritage', [])).toMatchObject({ ok: true, values: [] })
    expect(validateAnswerUpdate('country', [])).toMatchObject({ ok: true })
    expect(validateAnswerUpdate('country', ['United Kingdom', 'France'])).toMatchObject({ ok: false })
  })

  it('names the profile and preference columns it must also update', () => {
    expect(validateAnswerUpdate('menopause_stage', ['perimenopause'])).toMatchObject({
      ok: true,
      profileKey: 'menopause_stage',
      preferenceKey: null,
    })
    expect(validateAnswerUpdate('sleep_quality', ['poor'])).toMatchObject({
      ok: true,
      preferenceKey: 'sleep_quality',
    })
  })

  it("accepts the journey's new questions, with their own choices only", () => {
    expect(validateAnswerUpdate('how_are_you', ['really_struggling'])).toMatchObject({ ok: true })
    expect(validateAnswerUpdate('how_are_you', ['fine'])).toMatchObject({ ok: false })
    expect(validateAnswerUpdate('self_image', ['rather_not_say'])).toMatchObject({ ok: true })
  })

  it('caps size', () => {
    expect(validateAnswerUpdate('full_name', ['x'.repeat(501)])).toMatchObject({ ok: false })
  })
})
