/**
 * Translated plan content must carry exactly the English doses and numbers.
 * A translation that turns 300–400mg into 300–4000mg, or drops a supplement's
 * disclaimer, fails here (and in validate-content) before it can ship.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'
import type { WellnessFramework, WellnessRecommendation } from '@/types/database'
import {
  validateOverlay,
  loadOverlay,
  localizeRecs,
  buildEnglishIndex,
  numbersOf,
  dosesOf,
  localizeMaxDaily,
  validateCulturalOverlay,
  loadCulturalSource,
} from './plan-content-i18n'

const FRAMEWORKS_DIR = path.join(process.cwd(), 'content/wellness/frameworks')
const frameworks = fs
  .readdirSync(FRAMEWORKS_DIR)
  .filter((f) => f.endsWith('.yaml') && f !== 'template.yaml')
  .map((f) => yaml.load(fs.readFileSync(path.join(FRAMEWORKS_DIR, f), 'utf8')) as WellnessFramework)

describe('plan content translations', () => {
  for (const locale of ['fr', 'es', 'de', 'pt']) {
    it(`${locale}: every translated field keeps the English numbers and doses`, () => {
      const report = validateOverlay(frameworks, loadOverlay(locale, { strict: true }).recs, locale)
      expect(report.errors).toEqual([])
    })

    it(`${locale}: every recommendation is translated (title, body and disclaimer)`, () => {
      // A new or edited English card without a translation would otherwise
      // show in English silently. Fail instead, so it gets translated.
      const report = validateOverlay(frameworks, loadOverlay(locale, { strict: true }).recs, locale)
      expect(report.missing).toEqual([])
    })
  }

  it('normalises clock times so 1pm and 13 h compare equal', () => {
    expect(numbersOf('cutoff at 1pm, coffee at 3pm')).toEqual(numbersOf('arrêt à 13 h, café à 15 h'))
    expect(numbersOf('3pm')).toEqual(numbersOf('15:00'))
  })

  it('catches a dose whose unit or number changed', () => {
    expect(dosesOf('300–400mg')).not.toEqual(dosesOf('300–4000 mg'))
    expect(dosesOf('1000 IU')).toEqual(dosesOf('1000 UI'))
  })

  it('falls back to English, field by field, for anything untranslated', () => {
    const rec = { id: 'not_translated', title: 'T', body: 'B', priority: 'high', category: 'diet' } as WellnessRecommendation
    const [out] = localizeRecs([rec], loadOverlay('fr'), buildEnglishIndex(frameworks), 'fr')
    expect(out).toMatchObject({ title: 'T', body: 'B' })
  })

  it('keeps an unrecognised dose-ceiling note in English rather than guess', () => {
    const t = () => 'TRANSLATED'
    expect(localizeMaxDaily('Some other ceiling text', 'fr', t)).toBe('Some other ceiling text')
    expect(
      localizeMaxDaily(
        'Maximum 5000mg per day in total (combined EPA + DHA from supplements, adults) — this is the combined ceiling across everything in your plan, not per suggestion. Check with your GP or pharmacist before going near it.',
        'fr',
        t
      )
    ).toBe('TRANSLATED')
  })
})

describe('cultural content translations', () => {
  const english = loadCulturalSource()
  for (const locale of ['fr', 'es', 'de', 'pt']) {
    it(`${locale}: every translated cultural block keeps the English numbers and doses`, () => {
      expect(validateCulturalOverlay(english, loadOverlay(locale, { strict: true }).cultural, locale).errors).toEqual([])
    })

    it(`${locale}: every cultural block is translated`, () => {
      expect(validateCulturalOverlay(english, loadOverlay(locale, { strict: true }).cultural, locale).missing).toEqual([])
    })
  }
})
