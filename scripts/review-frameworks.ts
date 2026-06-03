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

const onlyId = process.argv[2]

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

function loadFrameworks(): WellnessFramework[] {
  const files = fs
    .readdirSync(FRAMEWORKS_DIR)
    .filter((f) => f.endsWith('.yaml') && !SKIP_FILES.includes(f))

  return files
    .map((f) => yaml.load(fs.readFileSync(path.join(FRAMEWORKS_DIR, f), 'utf8')) as WellnessFramework)
    .filter((fw) => fw && (!onlyId || fw.id === onlyId))
}

function main() {
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

  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.writeFileSync(OUT_FILE, doc, 'utf8')

  console.log(doc)
  console.log(`\n📝 Saved to ${path.relative(process.cwd(), OUT_FILE)} — send this to Pamela to review.\n`)
}

main()
