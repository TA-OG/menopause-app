/**
 * End-to-end check of what a non-English reader actually sees on /my-plan.
 *
 * The overlay tests prove each YAML block has a translation. This test proves
 * the render pipeline uses them. It builds a real plan from every framework,
 * so dedupe, merged benefits, extra disclaimers and dose ceilings are all
 * exercised. It adds the cultural context from every community file plus the
 * UK location modifier, localises both exactly as the page does, and fails on
 * any visible string that is still the English original.
 */
import { describe, expect, it } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'
import { createTranslator } from 'next-intl'
import type { WellnessFramework, WellnessRecommendation } from '@/types/database'
import { buildPlan } from './wellness-engine'
import { loadSubstanceRegistry } from './substance-registry'
import { buildCulturalContext, loadCulturalModifiers } from './cultural-engine'
import { COMMUNITY_FILE_MAP } from './community-map'
import {
  buildEnglishIndex,
  loadOverlay,
  localizeCultural,
  localizeRecs,
  type CeilingTranslator,
} from './plan-content-i18n'

const FRAMEWORKS_DIR = path.join(process.cwd(), 'content/wellness/frameworks')
const frameworks = fs
  .readdirSync(FRAMEWORKS_DIR)
  .filter((f) => f.endsWith('.yaml') && f !== 'template.yaml')
  .map((f) => yaml.load(fs.readFileSync(path.join(FRAMEWORKS_DIR, f), 'utf8')) as WellnessFramework)

const plan = buildPlan(frameworks, {}, undefined, loadSubstanceRegistry())
const allRecs = (): WellnessRecommendation[] => [
  ...plan.diet_adjustments,
  ...plan.lifestyle_adjustments,
  ...plan.mindset_recommendations,
  ...plan.supplement_suggestions,
]
const cultural = buildCulturalContext(loadCulturalModifiers(Object.keys(COMMUNITY_FILE_MAP), 'GB'))

/** Every string a plan card shows, keyed by where it came from. */
function visibleRecStrings(recs: WellnessRecommendation[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const r of recs) {
    out.set(`${r.id}.title`, r.title)
    out.set(`${r.id}.body`, r.body)
    if (r.disclaimer) out.set(`${r.id}.disclaimer`, r.disclaimer)
    if (r.max_daily_note) out.set(`${r.id}.max_daily_note`, r.max_daily_note)
    r.additional_disclaimers?.forEach((d, i) => out.set(`${r.id}.additional_disclaimers[${i}]`, d))
    r.also_for?.forEach((b, i) => {
      if (typeof b === 'string') out.set(`${r.id}.also_for[${i}]`, b)
      else {
        out.set(`${r.id}.also_for[${i}].title`, b.title)
        if (b.body) out.set(`${r.id}.also_for[${i}].body`, b.body)
      }
    })
  }
  return out
}

function visibleCulturalStrings(ctx: typeof cultural | null | undefined): Map<string, string> {
  const out = new Map<string, string>()
  if (!ctx) return out
  const sections = { awareness: ctx.awareness, diet: ctx.diet, lifestyle: ctx.lifestyle, mindset: ctx.mindset, supplements: ctx.supplements, locationInfo: ctx.locationInfo }
  for (const [section, list] of Object.entries(sections)) {
    ;(list ?? []).forEach((it: { id?: string; title?: string; body: string }, i: number) => {
      const key = `${section}.${it.id ?? i}`
      if (it.title) out.set(`${key}.title`, it.title)
      out.set(`${key}.body`, it.body)
    })
  }
  return out
}

/**
 * Strings whose correct translation IS the English text in that language.
 * Keep this list short and deliberate; every entry is a reviewed decision.
 */
const SAME_AS_ENGLISH: Record<string, string[]> = {
  es: ['ss_omega3_foundational.title'], // "Omega-3 (EPA/DHA)" is the Spanish spelling too
  de: ['ss_omega3_foundational.title'], // and the German one
}

describe('rendered plan is fully translated', () => {
  const index = buildEnglishIndex(frameworks)
  const english = visibleRecStrings(allRecs())
  const englishCultural = visibleCulturalStrings(cultural)

  it('exercises the tricky paths (merged cards, extra disclaimers, dose ceilings, cultural blocks)', () => {
    const recs = allRecs()
    expect(recs.some((r) => r.also_for?.length)).toBe(true)
    expect(recs.some((r) => r.additional_disclaimers?.length)).toBe(true)
    expect(recs.some((r) => r.max_daily_note)).toBe(true)
    expect(englishCultural.size).toBeGreaterThan(100)
  })

  for (const locale of ['fr', 'es', 'de', 'pt']) {
    it(`${locale}: no plan card or cultural block is left in English`, async () => {
      const messages = JSON.parse(fs.readFileSync(path.join(process.cwd(), `messages/${locale}.json`), 'utf8'))
      const t = createTranslator({ locale, messages, namespace: 'PlanCard' }) as unknown as CeilingTranslator
      const overlay = loadOverlay(locale, { strict: true })

      const localized = visibleRecStrings(localizeRecs(allRecs(), overlay, index, locale, t))
      const allowed = new Set(SAME_AS_ENGLISH[locale] ?? [])
      const untranslated = Array.from(localized)
        .filter(([k, v]) => english.get(k) === v && !allowed.has(k))
        .map(([k]) => k)
      expect(untranslated).toEqual([])

      const localizedCultural = visibleCulturalStrings(localizeCultural(cultural, overlay, locale))
      const untranslatedCultural = Array.from(localizedCultural)
        .filter(([k, v]) => englishCultural.get(k) === v)
        .map(([k]) => k)
      expect(untranslatedCultural).toEqual([])
    })
  }
})
