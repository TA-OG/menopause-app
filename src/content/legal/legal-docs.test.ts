/**
 * Every translated legal document must say the same things as the English.
 *
 * A reviewer can check wording; a test can check the parts that must never
 * drift silently: the same sections in the same order, every link and email
 * address untouched, and every number the same — 30 days must not become 3,
 * and a company number must not lose a digit.
 *
 * The one deliberate difference: translations add the EU emergency number
 * (112) next to the UK's 999, because a reader in France or Spain who calls
 * 999 reaches nobody. That is the only number allowed in a translation that
 * is not in the English.
 */

import { describe, it, expect } from 'vitest'
import { LEGAL, LEGAL_DOCS } from './index'

const TRANSLATIONS = ['fr', 'es', 'de', 'pt'] as const
const ALLOWED_EXTRA_NUMBERS = new Set(['112'])

const lines = (md: string, re: RegExp) => md.split('\n').filter((l) => re.test(l))
const urls = (md: string) => Array.from(md.matchAll(/\]\(([^)]+)\)/g), (m) => m[1]).sort()
const emails = (md: string) => Array.from(md.matchAll(/[\w.+-]+@[\w-]+\.[\w.]+/g), (m) => m[0]).sort()

/** Every digit run, ignoring text inside link targets (already checked as URLs). */
function numbers(md: string): string[] {
  const withoutLinks = md.replace(/\]\([^)]+\)/g, ']')
  return Array.from(withoutLinks.matchAll(/\d+(?:[.,]\d+)?/g), (m) => m[0].replace(',', '.')).sort()
}

describe('legal documents', () => {
  for (const doc of LEGAL_DOCS) {
    const en = LEGAL.en[doc]

    for (const locale of TRANSLATIONS) {
      describe(`${doc} (${locale})`, () => {
        const tr = LEGAL[locale][doc]

        it('has the same section structure as the English', () => {
          expect(lines(tr, /^#{1,3} /).map((l) => l.match(/^#+/)![0])).toEqual(
            lines(en, /^#{1,3} /).map((l) => l.match(/^#+/)![0])
          )
          // Section numbers ("## 5.") must line up — /terms#referrals depends on them.
          expect(lines(tr, /^## \d+\./).map((l) => l.match(/^## (\d+)\./)![1])).toEqual(
            lines(en, /^## \d+\./).map((l) => l.match(/^## (\d+)\./)![1])
          )
        })

        it('keeps every list item and table row', () => {
          expect(lines(tr, /^(>\s*)?(- |\d+\. )/).length).toBe(lines(en, /^(>\s*)?(- |\d+\. )/).length)
          expect(lines(tr, /^\|/).length).toBe(lines(en, /^\|/).length)
        })

        it('keeps every link and email address exactly', () => {
          expect(urls(tr)).toEqual(urls(en))
          expect(emails(tr)).toEqual(emails(en))
        })

        it('keeps every number', () => {
          const extra = numbers(tr).filter((n) => !ALLOWED_EXTRA_NUMBERS.has(n))
          expect(extra).toEqual(numbers(en))
        })
      })
    }
  }
})
