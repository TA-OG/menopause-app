/**
 * Render wellness frameworks as plain English for non-technical review.
 *
 * Turns the YAML logic into readable prose — "Shown when… we recommend…" —
 * so Pamela can confirm the app says the right thing without reading code.
 *
 *   npm run review-frameworks                    # all frameworks
 *   npm run review-frameworks hot-flashes-...    # one framework by id
 *
 * Writes review/frameworks-review.md and prints it to the console.
 */

import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'
import type {
  WellnessFramework,
  WellnessRecommendation,
  TriggerCondition,
} from '../src/types/database'

const FRAMEWORKS_DIR = path.join(process.cwd(), 'content/wellness/frameworks')
const OUT_DIR = path.join(process.cwd(), 'review')
const OUT_FILE = path.join(OUT_DIR, 'frameworks-review.md')
const SKIP_FILES = ['template.yaml']

const args = process.argv.slice(2)
/**
 * --check regenerates the review document and compares it to the committed one
 * WITHOUT writing, failing if they differ. Wired into `npm run build`.
 *
 * This exists because review/frameworks-review.md is the plain-English artefact
 * Pamela signs off, and it had silently drifted from what actually ships — it
 * described foundations items ("The Mediterranean pattern", "Drink 2 litres of
 * water a day", "Phytoestrogens") that no longer exist in the YAML. A sign-off
 * document that doesn't match the shipped content is worse than none, because
 * it looks like assurance.
 */
const checkMode = args.includes('--check')
const onlyId = args.find((a) => !a.startsWith('--'))

function humanize(value: string): string {
  return value.replace(/_/g, ' ').trim()
}

function describeCondition(c: TriggerCondition): string {
  const question = humanize(c.question)
  const answers = (Array.isArray(c.answer) ? c.answer : [c.answer]).map(humanize)
  const min = c.min_matches ?? 1

  if (answers.length === 1) {
    return `their **${question}** is "${answers[0]}"`
  }
  const list = answers.map((a) => `"${a}"`).join(', ')
  const count = min > 1 ? `at least ${min} of` : 'any of'
  return `their **${question}** is ${count}: ${list}`
}

function describeAudience(framework: WellnessFramework): string {
  if (framework.trigger_all) {
    return 'Shown to **every user**, regardless of their answers.'
  }
  if (!framework.trigger_conditions || framework.trigger_conditions.length === 0) {
    return '⚠️ No trigger conditions set — this framework will never be shown.'
  }
  const parts = framework.trigger_conditions.map(describeCondition)
  return `Shown when ${parts.join(' **AND** ')}.`
}

function describeRec(rec: WellnessRecommendation): string {
  const lines: string[] = []
  lines.push(`- **${rec.title}**  _(${rec.priority} priority)_`)
  lines.push(`  ${rec.body.trim().replace(/\s*\n\s*/g, ' ')}`)
  if (rec.who_for && rec.who_for !== 'all') {
    lines.push(`  _Only shown to: ${humanize(rec.who_for)}_`)
  }
  if (rec.targets_symptoms?.length) {
    lines.push(`  _Targets: ${rec.targets_symptoms.map(humanize).join(', ')}_`)
  }
  if (rec.disclaimer) {
    lines.push(`  _Disclaimer: ${rec.disclaimer.trim().replace(/\s*\n\s*/g, ' ')}_`)
  }
  return lines.join('\n')
}

const SECTIONS: { key: keyof WellnessFramework; heading: string }[] = [
  { key: 'diet_adjustments', heading: 'Food & diet' },
  { key: 'lifestyle_adjustments', heading: 'Lifestyle' },
  { key: 'mindset_recommendations', heading: 'Mindset & emotional' },
  { key: 'supplement_suggestions', heading: 'Supplements' },
]

function renderFramework(framework: WellnessFramework): string {
  const out: string[] = []
  out.push(`## ${framework.label ?? framework.id}`)
  out.push('')
  out.push(describeAudience(framework))
  out.push('')

  let total = 0
  for (const { key, heading } of SECTIONS) {
    const recs = (framework[key] as WellnessRecommendation[] | undefined) ?? []
    if (recs.length === 0) continue
    total += recs.length
    out.push(`### ${heading}`)
    out.push('')
    recs.forEach((rec) => out.push(describeRec(rec)))
    out.push('')
  }

  if (total === 0) {
    out.push('_No recommendations yet — this framework would show an empty plan._')
    out.push('')
  }
  return out.join('\n')
}

/**
 * Drop everything up to and including the `---` separator that closes the
 * header, so the generated "Reviewed:" date doesn't register as drift.
 */
function stripHeader(doc: string): string {
  const marker = '\n---\n'
  const i = doc.indexOf(marker)
  return (i === -1 ? doc : doc.slice(i + marker.length)).trim()
}

function loadFrameworks(): WellnessFramework[] {
  // Sorted so output order is deterministic. readdirSync's order is
  // filesystem-dependent, not lexicographic — without sorting, --check could
  // report drift from nothing but a reordered file listing.
  const files = fs
    .readdirSync(FRAMEWORKS_DIR)
    .filter((f) => f.endsWith('.yaml') && !SKIP_FILES.includes(f))
    .sort()

  return files
    .map((f) => yaml.load(fs.readFileSync(path.join(FRAMEWORKS_DIR, f), 'utf8')) as WellnessFramework)
    .filter((fw) => fw && (!onlyId || fw.id === onlyId))
}

function main() {
  // Validated before loading anything: --check compares the WHOLE document,
  // so a framework id doesn't make sense with it. Checking this before
  // loadFrameworks() matters because an unknown id would otherwise filter
  // down to an empty list and exit 0 as if nothing were wrong, rather than
  // rejecting the invalid invocation.
  if (checkMode && onlyId) {
    console.error('--check compares the whole document; do not pass a framework id with it.')
    process.exit(1)
  }

  const frameworks = loadFrameworks()

  if (frameworks.length === 0) {
    console.log(onlyId ? `No framework found with id "${onlyId}".` : 'No frameworks found.')
    return
  }

  const header = [
    '# Wellness plan — plain-English review',
    '',
    '_This is what the app will tell users, generated from the current content._',
    `_Reviewed: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}_`,
    '',
    '---',
    '',
  ].join('\n')

  const body = frameworks.map(renderFramework).join('\n---\n\n')
  const doc = header + body

  if (checkMode) {
    let committed: string
    try {
      committed = fs.readFileSync(OUT_FILE, 'utf8')
    } catch {
      console.error(
        `\n❌ ${path.relative(process.cwd(), OUT_FILE)} is missing.\n` +
        `   Run \`npm run review-frameworks\` and commit the result.\n`
      )
      process.exit(1)
    }

    // The header carries a generated date, which would otherwise differ on
    // every run. Only the content below it is meaningful for drift.
    if (stripHeader(committed) !== stripHeader(doc)) {
      console.error(
        `\n❌ ${path.relative(process.cwd(), OUT_FILE)} is out of date.\n\n` +
        `   It no longer matches the frameworks it is supposed to describe, which\n` +
        `   means the plain-English document being signed off is not what the app\n` +
        `   actually says.\n\n` +
        `   Fix: run \`npm run review-frameworks\` and commit the regenerated file.\n` +
        `   Then have the content changes re-checked before release.\n`
      )
      process.exit(1)
    }

    console.log('   ✅ Plain-English review document matches the current frameworks')
    return
  }

  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.writeFileSync(OUT_FILE, doc, 'utf8')

  console.log(doc)
  console.log(`\n📝 Saved to ${path.relative(process.cwd(), OUT_FILE)} — send this to Pamela to review.\n`)
}

main()
