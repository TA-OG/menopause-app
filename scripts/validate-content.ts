/**
 * Build-time validation for wellness framework YAML files.
 * Runs before every production build.
 * Fails build if any supplement is missing a disclaimer.
 */

import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'
import type { WellnessFramework, SubstanceEntry } from '../src/types/database'
import { validateFrameworks as validateFrameworksEngine } from '../src/lib/wellness-engine'

const FRAMEWORKS_DIR = path.join(process.cwd(), 'content/wellness/frameworks')
const REGISTRY_PATH = path.join(process.cwd(), 'content/wellness/substances.yaml')
const CLAIMS_PATH = path.join(process.cwd(), 'content/wellness/claims.yaml')
const SKIP_FILES = ['template.yaml']

function loadSubstances(): SubstanceEntry[] | null {
  try {
    const raw = fs.readFileSync(REGISTRY_PATH, 'utf8')
    const parsed = yaml.load(raw) as { substances?: SubstanceEntry[] } | null
    return parsed?.substances ?? []
  } catch {
    return null
  }
}

interface NumericClaim {
  id: string
  rec_id: string
  asserts: string
  verified: boolean
  authority?: string
  note?: string
}

function loadClaims(): NumericClaim[] | null {
  try {
    const raw = fs.readFileSync(CLAIMS_PATH, 'utf8')
    const parsed = yaml.load(raw) as { claims?: NumericClaim[] } | null
    return parsed?.claims ?? []
  } catch {
    return null
  }
}

/** YAML folding turns newlines into spaces; normalise before substring matching. */
function normalise(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * Validate the numeric claim register.
 *
 * The salt error ("below 0.5g per 100g", when the green band is 0.3g) shipped
 * AND passed a human review pass. Reading for tone and checking a number
 * against a published standard are different jobs. This pins each figure to
 * the recommendation it appears in, so editing the number breaks the build and
 * forces the question "against what source?" at the moment of the edit.
 */
function validateNumericClaims(
  frameworks: WellnessFramework[],
  claims: NumericClaim[] | null
): string[] {
  const errors: string[] = []

  if (claims === null) {
    return [
      `Numeric claim register missing or unparseable at content/wellness/claims.yaml.`,
    ]
  }

  // Index every recommendation's searchable text.
  const recText = new Map<string, string>()
  for (const framework of frameworks) {
    const allRecs = [
      ...(framework.diet_adjustments ?? []),
      ...(framework.lifestyle_adjustments ?? []),
      ...(framework.mindset_recommendations ?? []),
      ...(framework.supplement_suggestions ?? []),
    ]
    for (const rec of allRecs) {
      recText.set(rec.id, normalise(`${rec.title} ${rec.body} ${rec.disclaimer ?? ''}`))
    }
  }

  const seenIds = new Set<string>()

  for (const claim of claims) {
    if (!claim.id) {
      errors.push(`A numeric claim is missing an 'id'`)
      continue
    }
    if (seenIds.has(claim.id)) {
      errors.push(`Duplicate numeric claim id "${claim.id}"`)
    }
    seenIds.add(claim.id)

    if (claim.verified) {
      if (!claim.authority?.trim()) {
        errors.push(
          `[claim:${claim.id}] is marked verified but names no authority. ` +
          `A figure we cannot point at a source for must not be marked verified.`
        )
      }
    } else if (claim.authority) {
      errors.push(
        `[claim:${claim.id}] is not verified but names an authority. ` +
        `Either verify it and set verified: true, or remove the authority so the ` +
        `figure does not appear sourced when it is not.`
      )
    }

    const text = recText.get(claim.rec_id)
    if (text === undefined) {
      errors.push(
        `[claim:${claim.id}] references recommendation "${claim.rec_id}", which does not exist.`
      )
      continue
    }

    if (!text.includes(normalise(claim.asserts))) {
      errors.push(
        `[claim:${claim.id}] no longer matches "${claim.rec_id}". Expected to find:\n` +
        `       "${normalise(claim.asserts)}"\n` +
        `     The content changed but the register did not. If you changed a number, ` +
        `confirm the new one against a source and update claims.yaml.`
      )
    }
  }

  return errors
}

/**
 * Validate the substance registry against the frameworks.
 *
 * This is the build-time half of the dose-stacking guarantee. It makes it
 * impossible to add a supplement without declaring which substance it is —
 * which is what stops a future author silently reintroducing the defect where
 * five frameworks each contributed their own omega-3 card.
 */
function validateSubstanceRegistry(
  frameworks: WellnessFramework[],
  substances: SubstanceEntry[] | null
): string[] {
  const errors: string[] = []

  if (substances === null) {
    return [
      `Substance registry missing or unparseable at content/wellness/substances.yaml. ` +
      `It is required — it is what prevents the same substance being suggested several ` +
      `times over with additive doses.`,
    ]
  }

  const supplementIds = new Set<string>()
  for (const framework of frameworks) {
    for (const supplement of framework.supplement_suggestions ?? []) {
      supplementIds.add(supplement.id)
    }
  }

  const claimedBy = new Map<string, string[]>()
  const seenKeys = new Set<string>()

  for (const substance of substances) {
    if (!substance.key) {
      errors.push(`Substance registry entry is missing a 'key'`)
      continue
    }
    if (seenKeys.has(substance.key)) {
      errors.push(`Substance registry has duplicate key "${substance.key}"`)
    }
    seenKeys.add(substance.key)

    if (substance.limit_status === 'verified') {
      if (!substance.max_daily) {
        errors.push(
          `[${substance.key}] limit_status is 'verified' but max_daily is not set. ` +
          `Either provide the figure with its source, or mark it needs_clinical_review.`
        )
      } else if (!substance.max_daily.source?.trim()) {
        errors.push(
          `[${substance.key}] max_daily is set but carries no source. Every dose ceiling ` +
          `must cite a named authority — we never assert an unsourced limit.`
        )
      }
    } else if (substance.limit_status === 'needs_clinical_review') {
      if (substance.max_daily) {
        errors.push(
          `[${substance.key}] has a max_daily but is marked needs_clinical_review. ` +
          `An unverified ceiling must not be asserted — verify it or remove the figure.`
        )
      }
    } else {
      errors.push(
        `[${substance.key}] has invalid limit_status "${substance.limit_status}" ` +
        `(expected 'verified' or 'needs_clinical_review')`
      )
    }

    for (const recId of substance.recommendation_ids ?? []) {
      if (!supplementIds.has(recId)) {
        errors.push(
          `[${substance.key}] lists recommendation "${recId}", which is not a supplement ` +
          `in any framework. Remove it, or fix the ID.`
        )
      }
      claimedBy.set(recId, [...(claimedBy.get(recId) ?? []), substance.key])
    }
  }

  for (const recId of Array.from(supplementIds).sort()) {
    const owners = claimedBy.get(recId) ?? []
    if (owners.length === 0) {
      errors.push(
        `Supplement "${recId}" is not declared in content/wellness/substances.yaml. ` +
        `Every supplement must declare its substance so the engine can guarantee it is ` +
        `never suggested twice over with additive doses.`
      )
    } else if (owners.length > 1) {
      errors.push(
        `Supplement "${recId}" is claimed by more than one substance (${owners.join(', ')}). ` +
        `Each supplement must map to exactly one substance.`
      )
    }
  }

  return errors
}

function loadFrameworks(): WellnessFramework[] {
  const files = fs
    .readdirSync(FRAMEWORKS_DIR)
    .filter((f) => f.endsWith('.yaml') && !SKIP_FILES.includes(f))

  return files.map((file) => {
    const content = fs.readFileSync(path.join(FRAMEWORKS_DIR, file), 'utf8')
    return yaml.load(content) as WellnessFramework
  })
}

function validateFrameworks(frameworks: WellnessFramework[]): string[] {
  const errors: string[] = []
  const allIds = new Set<string>()

  for (const framework of frameworks) {
    if (!framework.id) {
      errors.push(`Framework missing required 'id' field`)
      continue
    }

    // trigger_all frameworks intentionally have no trigger_conditions
    if (!framework.trigger_all && (!framework.trigger_conditions || framework.trigger_conditions.length === 0)) {
      errors.push(`[${framework.id}] Missing trigger_conditions (and trigger_all is not set)`)
    }

    // Check supplement disclaimers
    for (const supplement of framework.supplement_suggestions ?? []) {
      if (!supplement.disclaimer || supplement.disclaimer.trim() === '') {
        errors.push(
          `[${framework.id}] Supplement "${supplement.id}" is missing a disclaimer. ` +
          `All supplements must include a GP check disclaimer.`
        )
      }
    }

    // Check for duplicate IDs across all recommendations
    const allRecs = [
      ...(framework.diet_adjustments ?? []),
      ...(framework.lifestyle_adjustments ?? []),
      ...(framework.mindset_recommendations ?? []),
      ...(framework.supplement_suggestions ?? []),
    ]

    for (const rec of allRecs) {
      if (allIds.has(rec.id)) {
        errors.push(
          `[${framework.id}] Duplicate recommendation ID "${rec.id}" — IDs must be globally unique`
        )
      }
      allIds.add(rec.id)
    }
  }

  return errors
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log('🔍 Validating wellness frameworks...')

const frameworks = loadFrameworks()
console.log(`   Found ${frameworks.length} framework(s)`)

if (frameworks.length === 0) {
  console.log('   ⚠️  No frameworks found — add YAML files to content/wellness/frameworks/')
  process.exit(0)
}

const substances = loadSubstances()
console.log(`   Found ${substances?.length ?? 0} registered substance(s)`)

const claims = loadClaims()
const unverifiedClaims = (claims ?? []).filter((c) => !c.verified).length
console.log(
  `   Found ${claims?.length ?? 0} registered numeric claim(s)` +
  (unverifiedClaims > 0 ? ` — ${unverifiedClaims} awaiting source verification` : '')
)

const errors = [
  ...validateFrameworks(frameworks),
  // The engine exports its own checks (supplement disclaimers, empty
  // frameworks). Run both — they had drifted apart, and a rule enforced in only
  // one of them is a rule that silently stops being enforced.
  ...validateFrameworksEngine(frameworks),
  ...validateSubstanceRegistry(frameworks, substances),
  ...validateNumericClaims(frameworks, claims),
]

if (errors.length > 0) {
  console.error('\n❌ Content validation failed:\n')
  errors.forEach((e) => console.error(`   • ${e}`))
  console.error('\nFix these errors before building.\n')
  process.exit(1)
}

console.log(`   ✅ All ${frameworks.length} framework(s) valid\n`)
process.exit(0)
