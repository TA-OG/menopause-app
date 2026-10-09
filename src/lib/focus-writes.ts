import type { SupabaseClient } from '@supabase/supabase-js'
import type { FocusWeek } from '@/types/database'
import type { FocusContext } from './focus-context'
import {
  nextSequence,
  openWeek,
  selectWeeklyChange,
  usedRecommendationIds,
  weekSnapshot,
} from './focus-programme'
import { chooseWeekChange, type Decision } from './focus-api'

/** Postgres unique-violation: another request got there first. */
export const UNIQUE_VIOLATION = '23505'

/**
 * Open the next week of her active programme.
 *
 * The database is the last word on "one open week": if two requests race,
 * the partial unique index rejects the second with 23505, reported as 409.
 * Re-selecting here (rather than trusting an id the client remembered) means
 * the choice is always made against her plan and answers as they are now.
 */
export async function openNextWeek(
  supabase: SupabaseClient,
  userId: string,
  context: FocusContext,
  today: string,
  recommendationId?: string
): Promise<Decision<{ week: FocusWeek }>> {
  const { programme, weeks, plan, signals } = context
  if (!programme) return { ok: false, status: 409, error: 'No active programme' }
  if (openWeek(weeks)) {
    return { ok: false, status: 409, error: 'A week is already in progress' }
  }

  const selection = selectWeeklyChange(
    plan,
    programme.focus_symptoms,
    signals,
    usedRecommendationIds(weeks)
  )
  const chosen = chooseWeekChange(selection, recommendationId)
  if (!chosen.ok) return chosen

  const { data, error } = await supabase
    .from('focus_weeks')
    .insert({
      programme_id: programme.id,
      user_id: userId,
      sequence: nextSequence(weeks),
      recommendation_id: chosen.choice.rec.id,
      recommendation_snapshot: weekSnapshot(chosen.choice.rec),
      covers_symptoms: chosen.choice.covers,
      starts_on: today,
    })
    .select()
    .single()

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { ok: false, status: 409, error: 'A week is already in progress' }
    }
    throw error
  }
  return { ok: true, week: data as FocusWeek }
}
