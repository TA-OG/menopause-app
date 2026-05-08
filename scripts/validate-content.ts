/**
 * Build-time validation for wellness framework YAML files.
 * Runs before every production build.
 * Fails build if any supplement is missing a disclaimer.
 */

import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'
import type { WellnessFramework } from '../src/types/database'

const FRAMEWORKS_DIR = path.join(process.cwd(), 'content/wellness/frameworks')
const SKIP_FILES = ['template.yaml']

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

    if (!framework.trigger_conditions || framework.trigger_conditions.length === 0) {
      errors.push(`[${framework.id}] Missing trigger_conditions`)
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

const errors = validateFrameworks(frameworks)

if (errors.length > 0) {
  console.error('\n❌ Content validation failed:\n')
  errors.forEach((e) => console.error(`   • ${e}`))
  console.error('\nFix these errors before building.\n')
  process.exit(1)
}

console.log(`   ✅ All ${frameworks.length} framework(s) valid\n`)
process.exit(0)
