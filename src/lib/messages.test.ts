/**
 * Every locale must carry exactly the keys English does.
 *
 * next-intl does not fail a build over a missing key: it renders the raw key
 * path ("CheckinHistory.gpNote") to the user at runtime. For a health app that
 * can mean a safety line silently replaced by a code string in one language,
 * so drift is caught here instead.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { SYMPTOM_KEYS } from './checkin-schema'

const LOCALES = ['en', 'fr', 'es', 'de', 'pt'] as const

type Messages = { [key: string]: string | Messages }

function load(locale: string): Messages {
  const file = path.resolve(__dirname, '../../messages', `${locale}.json`)
  return JSON.parse(readFileSync(file, 'utf8')) as Messages
}

function keyPaths(messages: Messages, prefix = ''): string[] {
  return Object.entries(messages).flatMap(([key, value]) =>
    typeof value === 'string' ? [`${prefix}${key}`] : keyPaths(value, `${prefix}${key}.`)
  )
}

describe('locale messages', () => {
  const english = keyPaths(load('en')).sort()

  for (const locale of LOCALES.filter((l) => l !== 'en')) {
    it(`${locale} has exactly the English keys`, () => {
      expect(keyPaths(load(locale)).sort()).toEqual(english)
    })
  }

  it('labels every symptom the check-in schema accepts', () => {
    // A stored check-in can hold any accepted key, not only the ones the form
    // offers today, and history must never show a raw key like vaginal_dryness.
    const labelled = Object.keys(load('en').Symptoms as Messages).sort()
    expect(labelled).toEqual([...SYMPTOM_KEYS].sort())
  })

  it('has no empty strings', () => {
    for (const locale of LOCALES) {
      const messages = load(locale)
      const empty = keyPaths(messages).filter((key) => {
        const value = key.split('.').reduce<string | Messages>(
          (node, part) => (node as Messages)[part],
          messages
        )
        return typeof value === 'string' && value.trim() === ''
      })
      expect(empty, locale).toEqual([])
    }
  })
})
