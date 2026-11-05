/**
 * Legal and policy documents, one Markdown string per document per locale.
 *
 * Bundled as modules rather than read from disk at request time, so a
 * deployment can never be missing a translation file — and the Record types
 * below make a missing document or locale a type error, not a blank page.
 *
 * ENGLISH IS THE BINDING VERSION. The translations exist for convenience and
 * must say so (LegalDocument renders that notice). When the English changes,
 * every translation must be updated in the same change — legal-docs.test.ts
 * checks they stay structurally in step (same sections, same links).
 */

import type { Locale } from '@/lib/locale-geo-map'
import en from './en'
import fr from './fr'
import es from './es'
import de from './de'
import pt from './pt'

export const LEGAL_DOCS = ['privacy', 'terms', 'cookies', 'dataDeletion', 'accessibility'] as const
export type LegalDoc = (typeof LEGAL_DOCS)[number]
export type LegalSet = Record<LegalDoc, string>

export const LEGAL: Record<Locale, LegalSet> = { en, fr, es, de, pt }

export function legalText(doc: LegalDoc, locale: Locale): string {
  return LEGAL[locale][doc]
}
