/**
 * The translated quiz must ask the same questions, with the same stored
 * values, in every language.
 *
 * messages.test.ts already guarantees every locale has exactly the English
 * keys. This file pins the other two links in the chain:
 *   config (canonical English) ⇄ en.json  — so a wording change in the
 *     config can't leave the translations describing an older question;
 *   translated label → stored value       — so choosing "Bouffées de
 *     chaleur" still stores hot_flashes, which is what frameworks match on.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import {
  STEPS,
  CONTINENT_OPTIONS,
  COMMUNITY_OPTIONS,
  COUNTRY_OPTIONS,
  TIMEZONE_OPTIONS,
  type Choice,
  type OnboardingStep,
} from './onboarding-config'
import {
  messageKey,
  onboardingMessages,
  localizeChoices,
  localizeStep,
  choiceSection,
  text,
} from './onboarding-i18n'
import { SUPPORTED_LOCALES } from './locale-geo-map'

function load(locale: string) {
  const file = path.resolve(__dirname, '../../messages', `${locale}.json`)
  return onboardingMessages(JSON.parse(readFileSync(file, 'utf8')))
}

type KeyedStep = Extract<OnboardingStep, { key: string }>
const keyedSteps = STEPS.filter((s): s is KeyedStep => 'key' in s)

function stepChoices(step: KeyedStep): Choice[] {
  if (step.kind === 'text') return []
  if (step.kind === 'single' && step.choicesFrom) {
    // Derived choices: offer everything the source step could offer.
    const source = keyedSteps.find((s) => s.key === step.choiceLabelsFrom)
    return source && source.kind !== 'text' ? source.choices ?? [] : []
  }
  return step.choices ?? []
}

/** [section, choices] for every choice list the quiz renders. */
const choiceLists: Array<[string[], Choice[]]> = [
  ...keyedSteps
    .filter((s) => s.kind !== 'text' && !(s.kind === 'single' && s.choicesFrom))
    .map((s): [string[], Choice[]] => [choiceSection(s), stepChoices(s)]),
  [['continents'], CONTINENT_OPTIONS],
  [['communities'], COMMUNITY_OPTIONS.flatMap((g) => g.options)],
  [['countries'], COUNTRY_OPTIONS],
  [['timezones'], TIMEZONE_OPTIONS.flatMap((g) => g.options)],
]

describe('onboarding quiz translation', () => {
  it('asks for the language first, before the disclaimer', () => {
    expect(STEPS[0]).toMatchObject({ kind: 'custom', component: 'language' })
    expect(STEPS[1]).toMatchObject({ kind: 'custom', component: 'disclaimer' })
  })

  it('maps every choice value to a distinct message key', () => {
    for (const [section, choices] of choiceLists) {
      const keys = choices.map((c) => messageKey(c.value))
      expect(new Set(keys).size, section.join('.')).toBe(keys.length)
    }
    const groups = [...COMMUNITY_OPTIONS, ...TIMEZONE_OPTIONS].map((g) => messageKey(g.group))
    expect(new Set(groups).size).toBe(groups.length)
  })

  it('en.json carries the config wording exactly', () => {
    const en = load('en')
    for (const step of STEPS) {
      if (step.kind === 'custom') continue
      const localized = localizeStep(en, step)
      expect(localized.title, `${step.id}.title`).toBe(step.title)
      expect(localized.subtitle, `${step.id}.subtitle`).toBe(step.subtitle)
      expect(text(en, ['steps', step.id, 'title'], '<missing>'), step.id).toBe(step.title)
    }
    for (const [section, choices] of choiceLists) {
      for (const c of choices) {
        expect(
          text(en, [...section, messageKey(c.value)], '<missing>'),
          `${section.join('.')}.${c.value}`
        ).toBe(c.label)
      }
    }
    for (const g of COMMUNITY_OPTIONS) {
      expect(text(en, ['communityGroups', messageKey(g.group)], '<missing>')).toBe(g.group)
    }
    for (const g of TIMEZONE_OPTIONS) {
      expect(text(en, ['timezoneGroups', messageKey(g.group)], '<missing>')).toBe(g.group)
    }
  })

  for (const locale of SUPPORTED_LOCALES) {
    it(`${locale}: translates every step and choice without touching stored values`, () => {
      const msgs = load(locale)
      for (const step of STEPS) {
        if (step.kind === 'custom') continue
        expect(text(msgs, ['steps', step.id, 'title'], '<missing>'), step.id).not.toBe('<missing>')
      }
      for (const [section, choices] of choiceLists) {
        const localized = localizeChoices(msgs, section, choices)
        expect(localized.map((c) => c.value)).toEqual(choices.map((c) => c.value))
        expect(localized.map((c) => c.exclusive)).toEqual(choices.map((c) => c.exclusive))
        for (const c of choices) {
          expect(
            text(msgs, [...section, messageKey(c.value)], '<missing>'),
            `${locale} ${section.join('.')}.${c.value}`
          ).not.toBe('<missing>')
        }
      }
    })
  }

  it('re-uses the symptoms labels for the primary-symptom step', () => {
    const step = keyedSteps.find((s) => s.key === 'primary_symptom')!
    expect(choiceSection(step)).toEqual(['choices', 'symptoms'])
  })

  it('falls back to the English label rather than a raw key', () => {
    const [choice] = localizeChoices(undefined, ['choices', 'symptoms'], [
      { value: 'hot_flashes', label: 'Hot flushes' },
    ])
    expect(choice).toEqual({ value: 'hot_flashes', label: 'Hot flushes' })
  })
})
