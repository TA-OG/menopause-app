import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'
import { COMMUNITY_FILE_MAP, LOCATION_FILE_MAP } from './community-map'

const CULTURAL_DIR = path.join(process.cwd(), 'content/wellness/cultural')

export interface CulturalModifier {
  id: string
  label: string
  type: 'cultural_modifier' | 'location_modifier'
  region?: string
  country?: string
  community?: string
  awareness?: { title: string; body: string; source?: string }
  diet_context?: { title?: string; items: CulturalItem[] }
  lifestyle_context?: CulturalItem[]
  mindset_context?: CulturalItem[]
  supplement_context?: CulturalItem[]
  vitamin_d?: { title: string; body: string }
  nhs_navigation?: { title: string; body: string }
  food_access?: { title: string; body: string }
  mental_health_uk?: { title: string; body: string }
}

export interface CulturalItem {
  id: string
  title?: string
  body: string
}

let fileCache: Map<string, CulturalModifier> = new Map()

function loadFile(filename: string): CulturalModifier | null {
  const cacheKey = filename
  if (process.env.NODE_ENV === 'production' && fileCache.has(cacheKey)) {
    return fileCache.get(cacheKey) ?? null
  }
  try {
    const content = fs.readFileSync(path.join(CULTURAL_DIR, filename), 'utf8')
    const modifier = yaml.load(content) as CulturalModifier
    fileCache.set(cacheKey, modifier)
    return modifier
  } catch {
    return null
  }
}

/**
 * Load cultural modifiers for given community selections + location.
 * Deduplicates by file. Falls back gracefully.
 */
export function loadCulturalModifiers(
  communities: string[],
  countryCode?: string
): CulturalModifier[] {
  const filenames = new Set<string>()

  // Community-level modifiers
  for (const community of communities ?? []) {
    const key = community.toLowerCase().replace(/[\s-]/g, '_')
    const filename = COMMUNITY_FILE_MAP[key]
    if (filename) filenames.add(filename)
  }

  // Location modifier
  if (countryCode) {
    const locFile = LOCATION_FILE_MAP[countryCode.toUpperCase()]
    if (locFile) filenames.add(locFile)
  }

  const modifiers: CulturalModifier[] = []
  for (const filename of Array.from(filenames)) {
    const modifier = loadFile(filename)
    if (modifier) modifiers.push(modifier)
  }

  return modifiers
}

/**
 * Build structured cultural context from loaded modifiers.
 */
export function buildCulturalContext(modifiers: CulturalModifier[]) {
  const awareness: Array<{ title: string; body: string; source?: string }> = []
  const diet: CulturalItem[] = []
  const lifestyle: CulturalItem[] = []
  const mindset: CulturalItem[] = []
  const supplements: CulturalItem[] = []
  const locationInfo: Array<{ title: string; body: string }> = []

  const seenIds = new Set<string>()

  function addUnique<T extends { id: string }>(arr: T[], items: T[]) {
    for (const item of items) {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id)
        arr.push(item)
      }
    }
  }

  for (const modifier of modifiers) {
    if (modifier.type === 'location_modifier') {
      // Flatten location modifier fields into locationInfo
      if (modifier.vitamin_d) {
        locationInfo.push({ title: modifier.vitamin_d.title, body: modifier.vitamin_d.body })
      }
      if (modifier.nhs_navigation) {
        locationInfo.push({ title: modifier.nhs_navigation.title, body: modifier.nhs_navigation.body })
      }
      if (modifier.food_access) {
        locationInfo.push({ title: modifier.food_access.title, body: modifier.food_access.body })
      }
      if (modifier.mental_health_uk) {
        locationInfo.push({ title: modifier.mental_health_uk.title, body: modifier.mental_health_uk.body })
      }
      continue
    }

    if (modifier.awareness) awareness.push(modifier.awareness)
    if (modifier.diet_context?.items) addUnique(diet, modifier.diet_context.items)
    if (modifier.lifestyle_context) addUnique(lifestyle, modifier.lifestyle_context)
    if (modifier.mindset_context) addUnique(mindset, modifier.mindset_context)
    if (modifier.supplement_context) addUnique(supplements, modifier.supplement_context)
  }

  return { awareness, diet, lifestyle, mindset, supplements, locationInfo }
}
