import type { SupabaseClient } from '@supabase/supabase-js'
import type { FocusProgramme, FocusWeek, SymptomKey } from '@/types/database'
import type { FocusContext } from './focus-context'
import {
  nextSequence,
  openWeek,
  selectWeeklyChange,
  usedRecommendationIds,
  weekSnapshot,
} from './focus-programme'
import { chooseWeekChange, decideWeekStart, type Decision } from './focus-api'

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
  const startable = decideWeekStart(weeks, today)
  if (!startable.ok) return startable

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

/**
 * Start a programme and open week 1.
 *
 * The caller has already validated `focus` against her intake and checked a
 * week-1 change exists, so a programme is never created with nothing to do.
 *
 * Two inserts, not one transaction. If week 1 fails to insert, she is left
 * with an active programme and no open week — the same state as just after a
 * review, which GET /api/focus already presents as "choose your next change".
 * So the failure is recoverable from the normal UI, and no compensating
 * delete (which could itself fail) is attempted.
 */
export async function startProgramme(
  supabase: SupabaseClient,
  userId: string,
  context: FocusContext,
  focus: SymptomKey[],
  today: string
): Promise<Decision<{ programme: FocusProgramme; week: FocusWeek }>> {
  const { data, error } = await supabase
    .from('focus_programmes')
    .insert({ user_id: userId, focus_symptoms: focus, started_on: today })
    .select()
    .single()

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { ok: false, status: 409, error: 'You already have a programme in progress' }
    }
    throw error
  }
  const programme = data as FocusProgramme

  const opened = await openNextWeek(
    supabase,
    userId,
    { ...context, programme, weeks: [] },
    today
  )
  if (!opened.ok) return opened
  return { ok: true, programme, week: opened.week }
}

/**
 * Close the open week with her review, dropping any kept changes she chose to
 * release to make room.
 *
 * Releases are written first, on purpose. If the second write fails, she has
 * fewer changes on her check-in and an unreviewed week — retrying succeeds and
 * the 3-change limit is never exceeded. The other order could fail leaving a
 * kept week AND every kept change still in place: four on her check-in.
 *
 * The week update is conditional on it still being open, so a second review
 * racing the first updates nothing and is reported as 409.
 */
export async function applyReview(
  supabase: SupabaseClient,
  programmeId: string,
  weekId: string,
  outcome: 'kept' | 'stopped' | 'swapped',
  releaseIds: string[],
  today: string
): Promise<Decision<{ week: FocusWeek }>> {
  if (releaseIds.length > 0) {
    const { error } = await supabase
      .from('focus_weeks')
      .update({ released_on: today })
      .in('id', releaseIds)
      .eq('programme_id', programmeId)
      .eq('outcome', 'kept')
      .is('released_on', null)
    if (error) throw error
  }

  const { data, error } = await supabase
    .from('focus_weeks')
    .update({ outcome, reviewed_at: new Date().toISOString() })
    .eq('id', weekId)
    .eq('programme_id', programmeId)
    .is('outcome', null)
    .select()
  if (error) throw error
  if (!data || data.length === 0) {
    return { ok: false, status: 409, error: 'This week has already been reviewed' }
  }
  return { ok: true, week: data[0] as FocusWeek }
}

/** End her active programme. Its weeks are kept, as her history. */
export async function endProgramme(
  supabase: SupabaseClient,
  userId: string
): Promise<Decision<{ programme: FocusProgramme }>> {
  const { data, error } = await supabase
    .from('focus_programmes')
    .update({ status: 'ended', ended_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('status', 'active')
    .select()
  if (error) throw error
  if (!data || data.length === 0) {
    return { ok: false, status: 404, error: 'No active programme' }
  }
  return { ok: true, programme: data[0] as FocusProgramme }
}
