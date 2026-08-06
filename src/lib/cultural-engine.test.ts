import { describe, it, expect } from 'vitest'
import { loadCulturalModifiers } from './cultural-engine'
import { COMMUNITY_FILE_MAP, LOCATION_FILE_MAP } from './community-map'

describe('community → file mapping', () => {
  it('does not fall back MENA communities to an unrelated region\'s content', () => {
    // These were previously mis-mapped to west-african.yaml. Showing another
    // ethnicity's cultural content is worse than showing none — assert they
    // stay unmapped until dedicated content exists, rather than silently
    // regaining a wrong fallback.
    const mena = [
      'arab', 'moroccan', 'algerian', 'egyptian', 'lebanese',
      'iranian', 'persian', 'turkish', 'kurdish', 'middle_eastern',
    ]
    for (const key of mena) {
      expect(COMMUNITY_FILE_MAP[key], `"${key}" should not be mapped to a file`).toBeUndefined()
    }
  })

  it('produces no cultural modifiers for unmapped MENA heritage selections', () => {
    const modifiers = loadCulturalModifiers(['moroccan', 'lebanese'])
    expect(modifiers).toHaveLength(0)
  })

  it('still maps known communities to their dedicated files', () => {
    expect(COMMUNITY_FILE_MAP['yoruba']).toBe('communities/nigeria-yoruba.yaml')
    expect(COMMUNITY_FILE_MAP['gujarati']).toBe('communities/india-gujarati.yaml')
  })
})

describe('location modifier wiring', () => {
  it('loads the UK diaspora modifier for a GB country code', () => {
    const modifiers = loadCulturalModifiers([], 'GB')
    expect(modifiers).toHaveLength(1)
    expect(modifiers[0].type).toBe('location_modifier')
  })

  it('is case-insensitive on country code', () => {
    const modifiers = loadCulturalModifiers([], 'gb')
    expect(modifiers).toHaveLength(1)
  })

  it('gracefully returns nothing for a country with no content file yet', () => {
    // US/CA/AU are declared in LOCATION_FILE_MAP but have no file on disk yet.
    expect(LOCATION_FILE_MAP['US']).toBeDefined()
    const modifiers = loadCulturalModifiers([], 'US')
    expect(modifiers).toHaveLength(0)
  })

  it('combines a heritage modifier and a location modifier together', () => {
    const modifiers = loadCulturalModifiers(['yoruba'], 'GB')
    const types = modifiers.map((m) => m.type).sort()
    expect(types).toEqual(['cultural_modifier', 'location_modifier'])
  })
})
