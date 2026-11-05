/**
 * Showing a stored plan in the reader's language.
 *
 * A plan is generated once, in English, and stored in `wellness_plans`; it is
 * then read back for months. So translation happens at RENDER time, keyed by
 * stable ids and values — never by rewriting what was stored, and never by
 * translating free text on the fly.
 *
 * Safety rule for everything in this file: if a translation is missing, show
 * the English. A caution in the "wrong" language is still a caution; a
 * caution that silently disappears is not.
 */

import type { WellnessRecommendation } from '@/types/database'

/** The slice of a next-intl translator this module needs (scoped to PlanCard). */
export interface NoteTranslator {
  (key: string, values?: Record<string, string>): string
  has(key: string): boolean
}

/**
 * Re-compose the engine's "You told us …" note in the reader's language.
 *
 * The engine (attachPersonalNotes) writes the note in English, but it also
 * records WHICH declared answers produced it (`because`). That is enough to
 * write the same sentence in any language without translating free text.
 * English readers get the engine's own sentence untouched — it is the
 * canonical wording the engine's tests pin.
 */
export function localizedPersonalNote(
  rec: WellnessRecommendation,
  locale: string,
  t: NoteTranslator
): WellnessRecommendation {
  const note = rec.personal_note
  if (!note || locale === 'en') return rec

  const labels = note.because.map((value) =>
    t.has(`circumstances.${value}`) ? t(`circumstances.${value}`) : null
  )
  // One untranslatable circumstance → keep the whole English note rather
  // than a sentence that silently omits part of what she told us.
  if (labels.some((l) => l === null) || labels.length === 0) return rec

  const because = new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(
    labels as string[]
  )
  const key = note.kind === 'caution' ? 'note.caution' : 'note.adapt'
  return { ...rec, personal_note: { ...note, text: t(key, { because }) } }
}
