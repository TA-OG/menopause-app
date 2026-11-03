/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SAFETY GATE — "a few questions to keep you safe", before any change is chosen
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every caution and personal note in her plan comes from two answers: her
 * medical flags and her dietary needs. A change chosen without them could be
 * one that is cautioned for her (e.g. a soy food for someone avoiding soy) and
 * nothing would say so. So the weekly programme (Foundations) does not start,
 * and no new change opens, until both are answered for the CURRENT version of
 * those questions.
 *
 * "Answered" means an explicit answer is stored, including "None of these" /
 * "No restrictions". An empty multi-select means unknown, never "none".
 *
 * Pure, no I/O. Derived entirely from onboarding_answers (each row carries
 * answered_at), so there is no separate flag for a client to set.
 */

import type { OnboardingAnswer } from '@/types/database'

/** The questions the gate requires. Both are multi-selects with a "none" option. */
export const SAFETY_QUESTION_KEYS = ['medical_flags', 'diet_restrictions'] as const
export type SafetyQuestionKey = (typeof SAFETY_QUESTION_KEYS)[number]

/**
 * When the safety questions last changed in a way that matters for safety:
 * a new option, or a change to what an option means. Answers given before
 * this were given to an older version and must be confirmed again.
 *
 * Bump it whenever MEDICAL_FLAG_CHOICES or DIET_RESTRICTION_CHOICES in
 * onboarding-config.ts gains an option. Never move it backwards.
 *
 * 2026-10-30: the journey's "Keeping you safe" session, which makes both
 * questions required. Everyone who answered before it confirms once, before
 * her first weekly change (decision of 13–14 Oct 2026).
 */
export const SAFETY_QUESTIONS_REVISED_AT = '2026-10-30T00:00:00Z'

export interface SafetyReview {
  /** True when the weekly programme must not start or open a change. */
  required: boolean
  /** Which questions still need an answer (or a fresh one). */
  missing: SafetyQuestionKey[]
}

type AnswerRow = Pick<OnboardingAnswer, 'question_key' | 'answer_value' | 'answered_at'>

export function reviewSafetyAnswers(
  answers: readonly AnswerRow[],
  revisedAt: string = SAFETY_QUESTIONS_REVISED_AT
): SafetyReview {
  const cutoff = Date.parse(revisedAt)
  const missing = SAFETY_QUESTION_KEYS.filter((key) => {
    const rows = answers.filter((a) => a.question_key === key && a.answer_value !== '')
    if (rows.length === 0) return true
    // A multi-select is saved as one row per choice, all at the same moment.
    // Every row must be current: a stale row alongside a fresh one means the
    // question was not answered again as a whole.
    return rows.some((r) => {
      const at = Date.parse(r.answered_at)
      return Number.isNaN(at) || at < cutoff
    })
  })
  return { required: missing.length > 0, missing }
}
