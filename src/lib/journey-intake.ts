/**
 * The journey's intake: the same questions as the wizard, asked in seven short
 * sessions in Mel's voice, plus five new ones (Care Journey, "Onboarding flow").
 *
 * WHAT MUST NOT CHANGE
 * The engine matches answer VALUES (onboarding-config.ts, "WHY THIS
 * MATTERS"). So an existing question asked here keeps every one of its
 * values. Only titles and labels change, and only for values that exist.
 * journey-intake.test.ts enforces both.
 *
 * Every existing question is asked, including three the draft left out
 * (severity, goal, what she has tried): each shapes her plan
 * (onboarding-influence.test.ts), and dropping one would quietly make her
 * plan worse. Recorded in docs/pamela-decisions-2026-10.md.
 */

import { STEPS, type Choice, type OnboardingStep } from './onboarding-config'
import { BETWEEN_SESSIONS, type CopyLine } from './journey-copy'

type KeyedStep = Extract<OnboardingStep, { key: string }>
type ChoiceStep = Extract<OnboardingStep, { kind: 'single' | 'multi' }>

// ─── New questions (Care Journey, marked NEW) ─────────────────────────────────
// Stored like every other answer. No framework triggers on them yet; they
// shape Mel's words (journey.ts), not which suggestions she gets.

const choices = (pairs: [string, string][]): Choice[] =>
  pairs.map(([value, label]) => ({ value, label }))

export const JOURNEY_NEW_STEPS: KeyedStep[] = [
  {
    id: 'how_are_you',
    kind: 'single',
    key: 'how_are_you',
    title: 'How are you, really, {name}?',
    choices: choices([
      ['coping', "I'm coping"],
      ['struggling_a_bit', "I'm struggling a bit"],
      ['really_struggling', "I'm really struggling"],
      ['dont_know', "I don't know any more"],
    ]),
  },
  {
    id: 'time_for_you',
    kind: 'single',
    key: 'time_for_you',
    title: 'When did you last have time that was just for you?',
    choices: choices([
      ['this_week', 'This week'],
      ['this_month', 'This month'],
      ['cant_remember', "I honestly can't remember"],
    ]),
  },
  {
    id: 'support_network',
    kind: 'single',
    key: 'support_network',
    title: 'Who do you have in your corner right now?',
    choices: choices([
      ['can_talk', 'People I can really talk to'],
      ['few_not_this', 'A few, but not about this'],
      ['keep_to_myself', 'I mostly keep it to myself'],
    ]),
  },
  {
    id: 'know_other_women',
    kind: 'single',
    key: 'know_other_women',
    title: 'Do you know other women going through this too?',
    choices: choices([
      ['yes_talk', 'Yes, and we talk about it'],
      ['yes_dont_talk', "Yes, but we don't talk about it"],
      ['not_really', 'Not really'],
    ]),
  },
  {
    id: 'self_image',
    kind: 'single',
    key: 'self_image',
    title: 'When you think about yourself right now, which feels closest?',
    choices: choices([
      ['still_me', 'Still me, just tired'],
      ['bit_lost', 'A bit lost'],
      ['stranger', 'Like a stranger to myself'],
      ['rather_not_say', "I'd rather not say"],
    ]),
  },
]

// ─── Existing questions, in Mel's words ───────────────────────────────────────

interface Rewording {
  title: string
  subtitle?: string
  /** New label per existing value. Values not listed keep their label. */
  labels?: Record<string, string>
}

const REWORDED: Record<string, Rewording> = {
  symptoms: {
    title: "Tell me everything that's been bothering you. Tick as many as you like. I'd rather hear all of it.",
  },
  primary_symptom: { title: 'Of all of those, which one weighs on you the most right now?' },
  sleep_quality: {
    title: 'How have your nights been lately?',
    labels: {
      good: 'Mostly fine',
      fair: 'Some broken nights',
      poor: 'Hard most nights',
      very_poor: 'Sleep feels impossible',
    },
  },
  stress_level: {
    title: 'And day to day, how full does your plate feel?',
    labels: {
      low: 'Manageable',
      moderate: 'Busy but OK',
      high: 'Too full',
      very_high: 'Overflowing',
    },
  },
  menopause_stage: { title: "Where do you feel you are in all this? It's fine not to know." },
  age_range: { title: 'Roughly how old are you?' },
  diet_type: { title: 'How would you describe how you eat at the moment? No judgement, love.' },
  exercise_level: { title: 'How much do you move in a normal week?' },
  caffeine_intake: { title: 'How many tea or coffee cups in a day?' },
  // Pamela: "Drink what? It should alcohol."
  alcohol_intake: { title: 'How often do you have an alcoholic drink?' },
  smoking_status: { title: 'Do you smoke?' },
  medical_flags: {
    title:
      "Do any of these apply to you? I'll use this to make sure nothing I suggest clashes with your health, and I'll flag anything worth checking with your GP.",
  },
  diet_restrictions: { title: "Any foods you avoid or can't have?" },
}

function existingStep(key: string): KeyedStep {
  const found = STEPS.find((s): s is KeyedStep => 'key' in s && s.key === key)
  if (!found) throw new Error(`journey-intake: no intake question "${key}"`)
  // Every journey question needs an answer, so an unanswered key always means
  // "not reached yet" and nextSession() can resume exactly where she stopped.
  // Each multi-select has an explicit "none" ("Nothing yet", "None of these").
  const step: KeyedStep =
    found.kind === 'multi' ? { ...found, minSelect: Math.max(1, found.minSelect ?? 0) } : found
  const words = REWORDED[key]
  if (!words) return step
  const reworded = { ...step, title: words.title, subtitle: words.subtitle ?? step.subtitle }
  if ((step.kind === 'single' || step.kind === 'multi') && step.choices && words.labels) {
    const labels = words.labels
    return {
      ...reworded,
      choices: step.choices.map((c) => ({ ...c, label: labels[c.value] ?? c.label })),
    } as ChoiceStep
  }
  return reworded as KeyedStep
}

const newStep = (key: string): KeyedStep => {
  const step = JOURNEY_NEW_STEPS.find((s) => s.key === key)
  if (!step) throw new Error(`journey-intake: no new question "${key}"`)
  return step
}

// ─── The seven sessions ───────────────────────────────────────────────────────

export type SessionId = 'feeling' | 'rest' | 'connection' | 'you' | 'day_to_day' | 'safe' | 'heritage'

export interface IntakeSession {
  id: SessionId
  title: string
  /** Asked in this order. 'heritage' is the bespoke continent/heritage/location trio. */
  steps: KeyedStep[]
  /** Mel's line once the session is done, before the next one. */
  after: CopyLine | null
  /** The whole session can be skipped. Only heritage (special-category data). */
  optional: boolean
}

export const SESSIONS: IntakeSession[] = [
  {
    id: 'feeling',
    title: "How you're feeling",
    steps: [newStep('how_are_you'), existingStep('symptoms'), existingStep('primary_symptom'), existingStep('symptom_severity')],
    after: BETWEEN_SESSIONS.afterFeeling,
    optional: false,
  },
  {
    id: 'rest',
    title: 'Rest',
    steps: [existingStep('sleep_quality'), newStep('time_for_you'), existingStep('stress_level')],
    after: BETWEEN_SESSIONS.afterRest,
    optional: false,
  },
  {
    id: 'connection',
    title: 'Connection',
    steps: [newStep('support_network'), newStep('know_other_women')],
    after: BETWEEN_SESSIONS.afterConnection,
    optional: false,
  },
  {
    id: 'you',
    title: 'You',
    steps: [newStep('self_image'), existingStep('menopause_stage')],
    after: BETWEEN_SESSIONS.afterYou,
    optional: false,
  },
  {
    id: 'day_to_day',
    title: 'Your day-to-day',
    steps: [
      existingStep('age_range'),
      existingStep('diet_type'),
      existingStep('exercise_level'),
      existingStep('caffeine_intake'),
      existingStep('alcohol_intake'),
      existingStep('smoking_status'),
      existingStep('primary_goal'),
      existingStep('previously_tried'),
    ],
    after: null,
    optional: false,
  },
  {
    id: 'safe',
    title: 'Keeping you safe',
    steps: [existingStep('medical_flags'), existingStep('diet_restrictions')],
    after: null,
    optional: false,
  },
  {
    id: 'heritage',
    title: "Where you're from",
    steps: [],
    after: null,
    optional: true,
  },
]

/** Every key a journey session stores, for the per-question save's allow-list. */
export function journeyQuestionKeys(): string[] {
  return SESSIONS.flatMap((s) => s.steps.map((st) => st.key))
}

/**
 * The first session she has not finished, given the keys she has answered:
 * where "I'll come back later" picks up. null when every required session
 * is done. Every journey question requires an answer (see existingStep), so
 * an unanswered key always means she has not reached it.
 */
export function nextSession(answeredKeys: ReadonlySet<string>): SessionId | null {
  const open = SESSIONS.find((s) => !s.optional && s.steps.some((st) => !answeredKeys.has(st.key)))
  return open?.id ?? null
}

/** The first unanswered question in a session (index into its steps). */
export function firstUnansweredStep(session: IntakeSession, answeredKeys: ReadonlySet<string>): number {
  const i = session.steps.findIndex((st) => !answeredKeys.has(st.key))
  return i === -1 ? session.steps.length : i
}
