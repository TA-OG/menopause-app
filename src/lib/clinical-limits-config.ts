/**
 * Clinical limits intake — the questions Pamela (or a clinician) answers in the
 * admin back end to set a maximum safe daily intake for each supplement.
 *
 * WHY THIS EXISTS
 *
 * content/wellness/substances.yaml guarantees a substance can only ever appear
 * once in a plan, so doses can never stack. But most substances there are
 * marked `needs_clinical_review` and assert no numeric ceiling, because an
 * upper limit is a clinical claim and we do not encode figures we cannot source.
 *
 * This questionnaire is how those figures get answered by a human who can
 * stand behind them. Answers land in `content_intake_responses` under the
 * `clinical_limits` round — the same table the content questionnaire uses, so
 * no new schema is needed.
 *
 * IMPORTANT: answering here does NOT change the app. An answer is a proposal
 * recorded for review; a developer still transcribes the signed-off figure into
 * substances.yaml, where validation requires a source alongside every number.
 * That deliberate manual step keeps a second pair of eyes on anything that
 * becomes a dose ceiling shown to women.
 *
 * The topic list is derived from the registry itself, so a substance drops off
 * this list the moment its limit is verified. There is no second list to
 * maintain.
 */

import type { IntakeQuestion } from './content-intake-config'
import type { SubstanceEntry, WellnessRecommendation } from '@/types/database'

/** The round these answers are stored under. */
export const CLINICAL_LIMITS_ROUND = 'clinical_limits'

/**
 * Asked once per substance. Deliberately plain English — the person answering
 * is a domain expert, not necessarily someone who thinks in ULs and NOAELs.
 */
export const LIMIT_QUESTIONS: IntakeQuestion[] = [
  {
    id: 'max_daily',
    prompt: 'What is the most a woman should take of this in one day, in total?',
    helper:
      'Give a number and a unit, e.g. "400mg" or "4000 IU". This is the combined ceiling across everything she might be taking — not the dose for one product. If you do not think a hard ceiling can be given, say so and explain why.',
    kind: 'short',
  },
  {
    id: 'source',
    prompt: 'Where does that figure come from?',
    helper:
      'A guideline, a paper, a monograph, a professional body — whatever you are relying on. We cannot publish a ceiling without being able to point at where it came from, so this one is required.',
    kind: 'short',
  },
  {
    id: 'not_suitable',
    prompt: 'Who should not take this at all?',
    helper:
      'Conditions, medications, pregnancy, anything where the answer is simply no. This becomes part of the warning shown with the suggestion.',
    kind: 'long',
  },
  {
    id: 'interactions',
    prompt: 'Anything it interacts with, or that we should warn about?',
    helper:
      'Medicines it affects, tests it interferes with, things it should not be combined with, or a maximum length of time to take it for.',
    kind: 'long',
    optional: true,
  },
  {
    id: 'notes',
    prompt: 'Anything else we have got wrong, or you would say differently?',
    helper:
      'The current wording shown to users is above. If it overstates the evidence or misses something, say so here.',
    kind: 'long',
    optional: true,
  },
]

export const REQUIRED_LIMIT_QUESTION_IDS = LIMIT_QUESTIONS.filter((q) => !q.optional).map(
  (q) => q.id,
)

/** One substance awaiting a clinical answer, with the context needed to answer it. */
export interface LimitTopic {
  /** Substance key from the registry — used as topic_id. */
  id: string
  label: string
  /** Registry note, e.g. why this one is tricky or a priority. */
  note?: string
  /** What users are currently told, so the reviewer can see what they're approving. */
  currentCopy: Array<{ id: string; title: string; body: string }>
}

/**
 * Build the question list from the registry: every substance still marked
 * `needs_clinical_review`, paired with the copy currently shown to users.
 *
 * Verified substances are excluded — once a limit is signed off and
 * transcribed, the question disappears from the admin list on its own.
 */
export function buildLimitTopics(
  substances: SubstanceEntry[],
  supplementsById: Map<string, WellnessRecommendation>,
): LimitTopic[] {
  return substances
    .filter((s) => s.limit_status === 'needs_clinical_review')
    .map((s) => ({
      id: s.key,
      label: s.display_name,
      note: s.note,
      currentCopy: (s.recommendation_ids ?? [])
        .map((recId) => supplementsById.get(recId))
        .filter((rec): rec is WellnessRecommendation => Boolean(rec))
        .map((rec) => ({ id: rec.id, title: rec.title, body: rec.body })),
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
}
