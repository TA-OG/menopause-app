/**
 * Plan content in the reader's language.
 *
 * Plans are generated once, in English, and stored in `wellness_plans`, then
 * read back for months. So the English YAML stays the single source of what a
 * recommendation says, and translations are OVERLAYS applied at render time,
 * keyed by stable recommendation / item ids:
 *
 *   content/wellness/i18n/<locale>/frameworks/<framework>.yaml
 *     <rec_id>: { title, body, disclaimer }
 *   content/wellness/i18n/<locale>/cultural.yaml
 *     items:   { <item_id>: { title, body } }
 *     byTitle: { "<English title>": { title, body } }   # awareness / location blocks have no id
 *
 * SAFETY RULES
 *  - Missing translation → the English text, never a blank or a raw key.
 *  - Engine logic (personal notes, caution matching) runs on the English
 *    BEFORE localisation, so translating never changes who gets which caution.
 *  - validateOverlays() fails the build if a translated field's doses differ
 *    from the English (every number, and every number+unit pair like 400mg).
 */

import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'
import type { WellnessFramework, WellnessRecommendation, MergedBenefit } from '@/types/database'
import type { CulturalContext } from './cultural-engine'

export interface TextFields {
  title?: string
  body?: string
  disclaimer?: string
}
export interface CulturalOverlay {
  items: Record<string, { title?: string; body?: string }>
  byTitle: Record<string, { title?: string; body?: string }>
}
export interface Overlay {
  recs: Record<string, TextFields>
  cultural: CulturalOverlay
}

const I18N_DIR = path.join(process.cwd(), 'content/wellness/i18n')
const FRAMEWORKS_DIR = path.join(process.cwd(), 'content/wellness/frameworks')
const REC_ARRAYS = [
  'diet_adjustments',
  'lifestyle_adjustments',
  'mindset_recommendations',
  'supplement_suggestions',
] as const

// ─── Loading ──────────────────────────────────────────────────────────────────

const cache = new Map<string, Overlay>()

export function emptyOverlay(): Overlay {
  return { recs: {}, cultural: { items: {}, byTitle: {} } }
}

/**
 * Read one overlay file. In strict mode (tests, validate-content) a broken file
 * throws so it can never ship; at runtime it is skipped with a log, and the
 * blocks it would have translated fall back to English instead of taking the
 * whole plan page down.
 */
function readOverlayFile<T>(file: string, strict: boolean): T | null {
  try {
    return (yaml.load(fs.readFileSync(file, 'utf8')) ?? {}) as T
  } catch (err) {
    if (strict) throw new Error(`Invalid translation overlay ${path.relative(process.cwd(), file)}: ${(err as Error).message}`)
    console.error(`[plan-content-i18n] skipping unreadable overlay ${file}:`, (err as Error).message)
    return null
  }
}

export function loadOverlay(locale: string, opts: { strict?: boolean } = {}): Overlay {
  const strict = opts.strict ?? false
  if (locale === 'en') return emptyOverlay()
  if (!strict && process.env.NODE_ENV === 'production' && cache.has(locale)) return cache.get(locale)!
  const overlay = emptyOverlay()
  const fwDir = path.join(I18N_DIR, locale, 'frameworks')
  let fwFiles: string[] = []
  try {
    fwFiles = fs.readdirSync(fwDir).filter((f) => f.endsWith('.yaml'))
  } catch {
    // No translations for this locale yet: English everywhere.
  }
  for (const file of fwFiles) {
    const data = readOverlayFile<Record<string, TextFields>>(path.join(fwDir, file), strict)
    if (data) Object.assign(overlay.recs, data)
  }
  // One overlay per cultural source file, mirroring content/wellness/cultural/
  // (including its communities/ and location-modifiers/ subfolders).
  const walk = (dir: string): string[] => {
    try {
      return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.yaml') ? [path.join(dir, e.name)] : []
      )
    } catch {
      return []
    }
  }
  for (const file of walk(path.join(I18N_DIR, locale, 'cultural'))) {
    const c = readOverlayFile<Partial<CulturalOverlay>>(file, strict)
    if (!c) continue
    Object.assign(overlay.cultural.items, c.items ?? {})
    for (const [title, v] of Object.entries(c.byTitle ?? {})) overlay.cultural.byTitle[norm(title)] = v
  }
  if (!strict) cache.set(locale, overlay)
  return overlay
}

/** English source text → recommendation id, for fields stored without an id. */
export interface EnglishIndex {
  disclaimerToId: Map<string, string>
  titleToId: Map<string, string>
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

export function buildEnglishIndex(frameworks: WellnessFramework[]): EnglishIndex {
  const disclaimerToId = new Map<string, string>()
  const titleToId = new Map<string, string>()
  for (const fw of frameworks) {
    for (const key of REC_ARRAYS) {
      for (const rec of (fw[key] ?? []) as WellnessRecommendation[]) {
        if (rec.disclaimer) disclaimerToId.set(norm(rec.disclaimer), rec.id)
        if (rec.title) titleToId.set(norm(rec.title), rec.id)
      }
    }
  }
  return { disclaimerToId, titleToId }
}

let englishIndexCache: EnglishIndex | null = null
export function loadEnglishIndex(): EnglishIndex {
  if (englishIndexCache && process.env.NODE_ENV === 'production') return englishIndexCache
  const frameworks = fs
    .readdirSync(FRAMEWORKS_DIR)
    .filter((f) => f.endsWith('.yaml') && f !== 'template.yaml')
    .map((f) => yaml.load(fs.readFileSync(path.join(FRAMEWORKS_DIR, f), 'utf8')) as WellnessFramework)
  englishIndexCache = buildEnglishIndex(frameworks)
  return englishIndexCache
}

// ─── Applying ─────────────────────────────────────────────────────────────────

const pick = (t: string | undefined, fallback: string) => (t && t.trim() ? t : fallback)

/** Dose-ceiling note, re-composed from the stored English (see formatMaxDailyNote). */
export interface CeilingTranslator {
  (key: 'maxDaily', values: { amount: string; unit: string; basis: string }): string
}
const MAX_DAILY = /^Maximum (\d+(?:\.\d+)?)(\S+) per day in total \((.+?)\) — this is the combined ceiling/
const BASIS: Record<string, Record<string, string>> = {
  'combined EPA + DHA from supplements, adults': {
    fr: 'EPA + DHA combinés issus de compléments, adultes',
    es: 'EPA + DHA combinados procedentes de suplementos, adultos',
    de: 'EPA + DHA zusammen aus Nahrungsergänzungsmitteln, Erwachsene',
    pt: 'EPA + DHA combinados provenientes de suplementos, adultos',
  },
}

export function localizeMaxDaily(note: string | undefined, locale: string, t?: CeilingTranslator): string | undefined {
  if (!note || locale === 'en' || !t) return note
  const m = note.match(MAX_DAILY)
  const basis = m ? BASIS[m[3]]?.[locale] : undefined
  if (!m || !basis) return note // unknown shape → keep the English ceiling
  return t('maxDaily', { amount: m[1], unit: m[2], basis })
}

export function localizeRecs(
  recs: WellnessRecommendation[],
  overlay: Overlay,
  index: EnglishIndex,
  locale: string,
  t?: CeilingTranslator
): WellnessRecommendation[] {
  if (locale === 'en') return recs
  return recs.map((rec) => {
    const tr = overlay.recs[rec.id] ?? {}
    const alsoFor = rec.also_for?.map((b): string | MergedBenefit => {
      if (typeof b === 'string') {
        const id = index.titleToId.get(norm(b))
        return id ? pick(overlay.recs[id]?.title, b) : b
      }
      const o = overlay.recs[b.id] ?? {}
      return { ...b, title: pick(o.title, b.title), body: pick(o.body, b.body) }
    })
    const additional = rec.additional_disclaimers?.map((d) => {
      const id = index.disclaimerToId.get(norm(d))
      return id ? pick(overlay.recs[id]?.disclaimer, d) : d
    })
    return {
      ...rec,
      title: pick(tr.title, rec.title),
      body: pick(tr.body, rec.body),
      disclaimer: rec.disclaimer === undefined ? undefined : pick(tr.disclaimer, rec.disclaimer),
      ...(alsoFor ? { also_for: alsoFor } : {}),
      ...(additional ? { additional_disclaimers: additional } : {}),
      max_daily_note: localizeMaxDaily(rec.max_daily_note, locale, t),
    }
  })
}

export function localizeCultural(
  ctx: CulturalContext | null | undefined,
  overlay: Overlay,
  locale: string
): CulturalContext | null | undefined {
  if (!ctx || locale === 'en') return ctx
  const { items, byTitle } = overlay.cultural
  const item = <T extends { id: string; title?: string; body: string }>(i: T): T => {
    const o = items[i.id] ?? {}
    return { ...i, title: i.title === undefined ? undefined : pick(o.title, i.title), body: pick(o.body, i.body) }
  }
  const titled = <T extends { title: string; body: string }>(i: T): T => {
    const o = byTitle[norm(i.title)] ?? {}
    return { ...i, title: pick(o.title, i.title), body: pick(o.body, i.body) }
  }
  return {
    ...ctx,
    awareness: (ctx.awareness ?? []).map(titled),
    diet: (ctx.diet ?? []).map(item),
    lifestyle: (ctx.lifestyle ?? []).map(item),
    mindset: (ctx.mindset ?? []).map(item),
    supplements: (ctx.supplements ?? []).map(item),
    locationInfo: (ctx.locationInfo ?? []).map(titled),
  }
}

// ─── Validation (used by validate-content and tests) ─────────────────────────

/**
 * Every number in a text, with clock times normalised to 24h so "1pm" in the
 * English and "13 h" / "13 Uhr" / "13:00" in a translation compare equal.
 */
export function numbersOf(text: string): string[] {
  const s = text
    .replace(/(\d{1,2})(?::(\d{2}))?\s?(am|pm)\b/gi, (_, h, m, ap) => {
      let hour = Number(h) % 12
      if (ap.toLowerCase() === 'pm') hour += 12
      return m && m !== '00' ? `${hour}:${m}` : String(hour)
    })
    .replace(/(\d{1,2})[:h]00\b/g, '$1')
  return Array.from(s.matchAll(/\d+(?:[.,]\d+)?/g), (m) => m[0].replace(',', '.')).sort()
}

/** Dose pairs like "400mg", "2 g", "1000 IU" — the number AND its unit must survive. */
export function dosesOf(text: string): string[] {
  return Array.from(
    text.matchAll(/(\d+(?:[.,]\d+)?)\s?(mg|mcg|µg|μg|IU|UI|IE|g|ml|kg)\b/g),
    (m) => `${m[1].replace(',', '.')}${m[2].replace(/μg|mcg/, 'µg').replace(/^(UI|IE)$/, 'IU')}`
  ).sort()
}

export interface OverlayReport {
  errors: string[]
  missing: string[]
  coverage: { translated: number; total: number }
}

export function validateOverlay(
  frameworks: WellnessFramework[],
  recsOverlay: Record<string, TextFields>,
  locale: string
): OverlayReport {
  const errors: string[] = []
  const missing: string[] = []
  const english = new Map<string, WellnessRecommendation>()
  for (const fw of frameworks)
    for (const key of REC_ARRAYS) for (const r of (fw[key] ?? []) as WellnessRecommendation[]) english.set(r.id, r)

  for (const id of Object.keys(recsOverlay)) {
    if (!english.has(id)) errors.push(`[${locale}] overlay has unknown recommendation id "${id}"`)
  }
  let translated = 0
  for (const [id, en] of Array.from(english)) {
    const tr = recsOverlay[id]
    const fields = (['title', 'body', 'disclaimer'] as const).filter((f) => en[f]?.trim())
    if (!tr || fields.some((f) => !tr[f]?.trim())) {
      missing.push(id)
      // A supplement translated without its disclaimer would show translated
      // dosing above an English caution — never allow that half-state.
      if (tr && en.category === 'supplement' && en.disclaimer && !tr.disclaimer?.trim()) {
        errors.push(`[${locale}:${id}] supplement translated without its disclaimer`)
      }
      if (!tr) continue
    } else {
      translated++
    }
    for (const f of fields) {
      const t = tr[f]
      if (!t?.trim()) continue
      const a = numbersOf(en[f]!).join(' ')
      const b = numbersOf(t).join(' ')
      if (a !== b) errors.push(`[${locale}:${id}.${f}] numbers differ — en: ${a || '∅'} | ${locale}: ${b || '∅'}`)
      const da = dosesOf(en[f]!).join(' ')
      const db = dosesOf(t).join(' ')
      if (da !== db) errors.push(`[${locale}:${id}.${f}] doses differ — en: ${da || '∅'} | ${locale}: ${db || '∅'}`)
    }
  }
  return { errors, missing, coverage: { translated, total: english.size } }
}

/** English cultural items/blocks, keyed the same way the overlays are. */
export interface CulturalSource {
  items: Record<string, { title?: string; body: string }>
  byTitle: Record<string, { title: string; body: string }>
}

export function validateCulturalOverlay(
  english: CulturalSource,
  overlay: CulturalOverlay,
  locale: string
): OverlayReport {
  const errors: string[] = []
  const missing: string[] = []
  let translated = 0
  const check = (key: string, en: { title?: string; body: string }, tr?: { title?: string; body?: string }) => {
    if (!tr || !tr.body?.trim() || (en.title && !tr.title?.trim())) {
      missing.push(key)
      if (!tr) return
    } else {
      translated++
    }
    for (const f of ['title', 'body'] as const) {
      const a = en[f]
      const b = tr[f]
      if (!a?.trim() || !b?.trim()) continue
      if (numbersOf(a).join(' ') !== numbersOf(b).join(' '))
        errors.push(`[${locale}:${key}.${f}] numbers differ — en: ${numbersOf(a).join(' ')} | ${locale}: ${numbersOf(b).join(' ')}`)
      if (dosesOf(a).join(' ') !== dosesOf(b).join(' '))
        errors.push(`[${locale}:${key}.${f}] doses differ — en: ${dosesOf(a).join(' ')} | ${locale}: ${dosesOf(b).join(' ')}`)
    }
  }
  for (const [id, en] of Object.entries(english.items)) check(id, en, overlay.items[id])
  for (const [title, en] of Object.entries(english.byTitle)) check(title, en, overlay.byTitle[norm(title)])
  for (const id of Object.keys(overlay.items))
    if (!english.items[id]) errors.push(`[${locale}] cultural overlay has unknown item id "${id}"`)
  return {
    errors,
    missing,
    coverage: { translated, total: Object.keys(english.items).length + Object.keys(english.byTitle).length },
  }
}

/** Read every English cultural file into the overlay key shape. */
export function loadCulturalSource(): CulturalSource {
  const dir = path.join(process.cwd(), 'content/wellness/cultural')
  const walk = (d: string): string[] =>
    fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.yaml') ? [path.join(d, e.name)] : []
    )
  const out: CulturalSource = { items: {}, byTitle: {} }
  for (const f of walk(dir)) {
    const m = yaml.load(fs.readFileSync(f, 'utf8')) as Record<string, unknown> & {
      awareness?: { title: string; body: string }
      diet_context?: { items?: { id: string; title?: string; body: string }[] }
      lifestyle_context?: { id: string; title?: string; body: string }[]
      mindset_context?: { id: string; title?: string; body: string }[]
      supplement_context?: { id: string; title?: string; body: string }[]
    }
    const titled = [m.awareness, ...(['vitamin_d', 'nhs_navigation', 'food_access', 'mental_health_uk'] as const).map(
      (k) => m[k] as { title: string; body: string } | undefined
    )]
    for (const b of titled) if (b) out.byTitle[norm(b.title)] = b
    for (const i of [
      ...(m.diet_context?.items ?? []),
      ...(m.lifestyle_context ?? []),
      ...(m.mindset_context ?? []),
      ...(m.supplement_context ?? []),
    ])
      out.items[i.id] = i
  }
  return out
}
