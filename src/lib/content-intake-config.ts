/**
 * Content intake config — the author-side questionnaire Pamela works through
 * in the admin back end (/admin/intake).
 *
 * This is the in-app counterpart to content/interview-guide.md: the SAME
 * question block is "duplicated" across every topic, so a foundation round can
 * be captured now and the recorded Fathom round added later. Differing answers
 * across rounds are useful signal, not a conflict.
 *
 * To add a topic: add an entry to TOPICS. To change the questions asked for
 * every topic: edit QUESTIONS. Nothing else needs to change — the admin form,
 * storage, and progress counts all derive from these two arrays.
 */

export type QuestionKind = 'short' | 'long'

export interface IntakeQuestion {
  /** Stable key stored with the answer — never rename once answers exist. */
  id: string
  /** The plain-English prompt the host/author reads. */
  prompt: string
  /** Optional clarifying sub-text shown under the prompt. */
  helper?: string
  /** Sizes the textarea; 'long' for narration, 'short' for a line or two. */
  kind: QuestionKind
  /** Optional questions can be skipped without blocking "topic complete". */
  optional?: boolean
}

export interface IntakeTopic {
  id: string
  label: string
  /** One-line orientation shown at the top of the topic. */
  blurb?: string
}

/**
 * The per-topic block, mirroring content/interview-guide.md:
 *   2 closed "who is this for" questions  → framework trigger_conditions
 *   4 open "what helps" prompts           → recommendation bodies
 *   + safety + the one-line takeaway
 */
export const QUESTIONS: IntakeQuestion[] = [
  {
    id: 'who_for',
    prompt: 'Who is this advice mainly for?',
    helper:
      'Perimenopause, menopause, postmenopause, after surgical menopause — or all of them? Say as many as apply.',
    kind: 'short',
  },
  {
    id: 'depends_on',
    prompt:
      'Does the advice change depending on how she is doing in other areas — sleep, stress, how active she is, her diet?',
    helper: 'If it does, tell us how it changes. If it is the same for everyone, just say so.',
    kind: 'long',
  },
  {
    id: 'not_suitable',
    prompt: 'Is there anyone this is NOT safe or suitable for?',
    helper: 'Any conditions, medications, or situations where she should not follow this.',
    kind: 'short',
    optional: true,
  },
  {
    id: 'food',
    prompt: 'Food & diet — what should she eat, or avoid, for this?',
    helper: 'Anything specific — foods, drinks, timing, amounts.',
    kind: 'long',
  },
  {
    id: 'lifestyle',
    prompt: 'Lifestyle — what daily habits help?',
    helper: 'Movement, sleep routine, work, environment — things she can change day to day.',
    kind: 'long',
  },
  {
    id: 'mindset',
    prompt: 'Mindset & emotional — what should she understand or believe about this?',
    helper: 'How should she think about it — and when should she see her GP?',
    kind: 'long',
  },
  {
    id: 'supplements',
    prompt: 'Supplements — are there any you would mention?',
    helper:
      'Dose, what to look for, and the safety warning you would always give. Every supplement needs a "check with your GP first" caveat.',
    kind: 'long',
    optional: true,
  },
  {
    id: 'one_thing',
    prompt: 'If you could say one thing to a woman struggling with this, what is it?',
    helper: 'This often becomes the headline of the article.',
    kind: 'short',
  },
]

/**
 * Topics, in the suggested running order from the interview guide:
 * foundations first, then one per symptom.
 */
export const TOPICS: IntakeTopic[] = [
  {
    id: 'foundations',
    label: 'Foundations',
    blurb: 'What every woman should do, regardless of symptoms. Becomes the universal plan shown to everyone.',
  },
  { id: 'hot_flushes', label: 'Hot flushes' },
  { id: 'night_sweats', label: 'Night sweats' },
  { id: 'sleep_problems', label: 'Sleep problems' },
  { id: 'mood_changes', label: 'Mood changes / irritability' },
  { id: 'anxiety', label: 'Anxiety' },
  { id: 'brain_fog', label: 'Brain fog / memory' },
  { id: 'weight_changes', label: 'Weight changes' },
  { id: 'joint_aches', label: 'Joint or muscle aches' },
  { id: 'low_energy', label: 'Low energy / fatigue' },
  { id: 'low_libido', label: 'Low libido' },
  { id: 'vaginal_dryness', label: 'Vaginal dryness' },
  { id: 'skin_changes', label: 'Skin changes' },
  { id: 'hair_changes', label: 'Hair changes' },
]

/** The round this admin questionnaire writes to. */
export const FOUNDATION_ROUND = 'foundation'

/** Questions that must be answered for a topic to count as "complete". */
export const REQUIRED_QUESTION_IDS = QUESTIONS.filter((q) => !q.optional).map((q) => q.id)

export function getTopic(id: string): IntakeTopic | undefined {
  return TOPICS.find((t) => t.id === id)
}
