/**
 * ─────────────────────────────────────────────────────────────────────────────
 * USER SIGNALS — everything she told us, in one object the engine can read
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * THE PROBLEM THIS SOLVES
 *
 * `buildPlan()` received `preferences` and `primarySymptom`, and the engine read
 * exactly one field off `preferences`: `exercise_level`. The full answer set was
 * never passed in at all. So of the 20 questions onboarding asks, 11 could not
 * influence the plan under any circumstances — their answers were written to
 * `onboarding_answers` and then never read again:
 *
 *   age_range · symptom_severity · primary_goal · diet_type · diet_restrictions
 *   smoking_status · alcohol_intake · caffeine_intake · sleep_quality
 *   medical_flags · previously_tried
 *
 * That is not a ranking bug. A woman who told us she is vegan, drinks four
 * coffees a day, doesn't smoke, and has a history of an oestrogen-sensitive
 * cancer received exactly the same plan as a woman who answered none of those.
 * Asking a question and discarding the answer is worse than not asking: it
 * spends her patience and buys her nothing.
 *
 * Pure functions only, no I/O — same contract as wellness-engine.ts.
 *
 * ANSWER STORAGE
 * `onboarding_answers` is one row per (question_key, answer_value). Multi-select
 * questions (symptoms, diet_restrictions, medical_flags, previously_tried,
 * heritage) therefore write SEVERAL rows sharing a question_key — see migration
 * 014, which fixed a unique constraint that had been collapsing them to one.
 * Single-select questions write one row. `collectMany` and `collectOne` below
 * are the two readers for those two shapes.
 */

import type {
  OnboardingAnswer,
  UserPreferences,
  UserSignals,
} from '@/types/database'

/**
 * Answer values that mean "nothing here applies". They are real stored answers
 * — the user did tick them — but they must not behave like a declared
 * restriction or flag, or a woman who ticked "None of these" would be treated
 * as though she had declared a condition called `none`.
 */
const NEGATIVE_ANSWERS = new Set(['none', 'Nothing yet'])

/** All values for a multi-select question, with "none of these" removed. */
function collectMany(answers: OnboardingAnswer[], key: string): string[] {
  return answers
    .filter((a) => a.question_key === key)
    .map((a) => a.answer_value)
    .filter((v) => typeof v === 'string' && v.trim() !== '')
    .filter((v) => !NEGATIVE_ANSWERS.has(v))
}

/**
 * The value for a single-select question.
 *
 * If several rows somehow exist for a single-select key, the FIRST is taken and
 * the rest ignored, deterministically. Silently picking a different one on
 * different runs would make a plan irreproducible, which matters when someone
 * asks why their plan changed.
 */
function collectOne(
  answers: OnboardingAnswer[],
  key: string
): string | undefined {
  const found = answers.find(
    (a) =>
      a.question_key === key &&
      typeof a.answer_value === 'string' &&
      a.answer_value.trim() !== ''
  )
  return found?.answer_value
}

/**
 * Build the engine's view of the user from her stored answers.
 *
 * `answers` is authoritative. `preferences` is a fallback only: onboarding
 * copies four keys onto the `user_preferences` row (PREFERENCE_KEYS), and those
 * columns can be edited later via /api/preferences without writing back to
 * `onboarding_answers`. Reading answers first and falling back to preferences
 * means a later edit still counts, while a user who never touched preferences
 * behaves exactly as her intake said.
 *
 * Total by construction — every field is optional or an array, so a user with
 * no answers at all yields an empty-but-valid signal set rather than throwing.
 */
export function deriveUserSignals(
  answers: OnboardingAnswer[] = [],
  preferences: Partial<UserPreferences> = {}
): UserSignals {
  const one = (key: string) => collectOne(answers, key)

  return {
    age_range: one('age_range'),
    menopause_stage: one('menopause_stage'),
    symptoms: collectMany(answers, 'symptoms'),
    primary_symptom: one('primary_symptom'),
    symptom_severity: one('symptom_severity'),
    primary_goal: one('primary_goal'),

    diet_type: one('diet_type') ?? preferences.diet_type ?? undefined,
    diet_restrictions: collectMany(answers, 'diet_restrictions'),

    exercise_level:
      one('exercise_level') ?? preferences.exercise_level ?? undefined,

    // NO preferences fallback for smoking or alcohol — deliberate. The
    // `user_preferences` columns use a DIFFERENT vocabulary from the onboarding
    // choices, and mixing them would inject values nothing can match:
    //
    //   alcohol  onboarding: none | occasional | regular | frequent
    //            preferences: never | occasionally | weekly | daily   (no overlap at all)
    //   smoking  onboarding: non_smoker | ex_smoker | occasional_smoker | regular_smoker
    //            preferences: never | ex_smoker | current             (only ex_smoker overlaps)
    //
    // Onboarding does not copy either key to `user_preferences` (they are not in
    // PREFERENCE_KEYS), so those columns are written only via /api/preferences.
    // Falling back would mean a condition written as `alcohol_intake: frequent`
    // silently never fires for a user whose value came from preferences.
    // Reconciling the two vocabularies is a migration, tracked separately —
    // until then, answers are the only safe source.
    smoking_status: one('smoking_status'),
    alcohol_intake: one('alcohol_intake'),
    caffeine_intake: one('caffeine_intake'),
    sleep_quality: one('sleep_quality') ?? preferences.sleep_quality ?? undefined,
    stress_level: one('stress_level') ?? preferences.stress_level ?? undefined,

    medical_flags: collectMany(answers, 'medical_flags'),
    previously_tried: collectMany(answers, 'previously_tried'),
  }
}

/**
 * Re-express signals as onboarding answers, so rank-time conditions
 * (`relevant_when`) can be evaluated with the same matcher that framework
 * `trigger_conditions` use.
 *
 * One matcher for both means relevance and triggering can never drift apart in
 * how they read an answer — and a condition an author writes behaves the same
 * wherever they write it.
 */
export function signalsToAnswers(signals: UserSignals): OnboardingAnswer[] {
  const rows: { key: string; value: string }[] = []

  const push = (key: string, value?: string) => {
    if (value) rows.push({ key, value })
  }
  const pushAll = (key: string, values: string[]) => {
    for (const value of values) rows.push({ key, value })
  }

  push('age_range', signals.age_range)
  push('menopause_stage', signals.menopause_stage)
  pushAll('symptoms', signals.symptoms)
  push('primary_symptom', signals.primary_symptom)
  push('symptom_severity', signals.symptom_severity)
  push('primary_goal', signals.primary_goal)
  push('diet_type', signals.diet_type)
  pushAll('diet_restrictions', signals.diet_restrictions)
  push('exercise_level', signals.exercise_level)
  push('smoking_status', signals.smoking_status)
  push('alcohol_intake', signals.alcohol_intake)
  push('caffeine_intake', signals.caffeine_intake)
  push('sleep_quality', signals.sleep_quality)
  push('stress_level', signals.stress_level)
  pushAll('medical_flags', signals.medical_flags)
  pushAll('previously_tried', signals.previously_tried)

  return rows.map((row, i) => ({
    id: `signal-${i}`,
    user_id: 'signals',
    question_key: row.key,
    answer_value: row.value,
    answered_at: '',
  }))
}
