/**
 * Content modules are fetched for both the requested locale and 'en' in one
 * query (only two locales' worth of translation exist per article at most),
 * then deduped here — preferring the requested locale's row over the
 * English fallback so an untranslated article still renders instead of
 * disappearing from the list.
 */
export function pickLocalizedModules<T extends { slug: string; locale: string }>(
  rows: T[],
  locale: string
): T[] {
  const bySlug = new Map<string, T>()
  for (const row of rows) {
    const existing = bySlug.get(row.slug)
    if (!existing || row.locale === locale) {
      bySlug.set(row.slug, row)
    }
  }
  return Array.from(bySlug.values())
}
