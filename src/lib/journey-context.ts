import type { SupabaseClient } from '@supabase/supabase-js'
import { getUserAccess } from '@/lib/access'
import { deriveUserSignals } from '@/lib/user-signals'
import { journeyVisibleTo } from '@/lib/journey'
import type { JourneyDayRow, JourneyRow } from '@/lib/journey-api'
import type { FocusWeek, OnboardingAnswer, UserSignals } from '@/types/database'

/**
 * Everything the journey routes need about the signed-in user, loaded once.
 * `visible` false means the journey is not open to her yet (journeyVisibleTo):
 * the routes answer 404, as if it did not exist.
 */
export interface JourneyContext {
  visible: boolean
  isPremium: boolean
  name: string | null
  answers: OnboardingAnswer[]
  signals: UserSignals
  journey: JourneyRow | null
  weeks: Pick<FocusWeek, 'kind' | 'outcome'>[]
  foundationsStarted: boolean
}

export async function loadJourneyContext(
  supabase: SupabaseClient,
  userId: string
): Promise<JourneyContext> {
  const { isAdmin, isPremium } = await getUserAccess(supabase, userId)
  const visible = journeyVisibleTo({ isAdmin })
  const empty: JourneyContext = {
    visible,
    isPremium,
    name: null,
    answers: [],
    signals: deriveUserSignals([], {}),
    journey: null,
    weeks: [],
    foundationsStarted: false,
  }
  if (!visible) return empty

  const [profileRes, answersRes, journeyRes, programmeRes] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', userId).maybeSingle(),
    supabase.from('onboarding_answers').select('*').eq('user_id', userId),
    supabase.from('journeys').select('focus_area, started_on').eq('user_id', userId).maybeSingle(),
    supabase.from('focus_programmes').select('id').eq('user_id', userId).eq('status', 'active').maybeSingle(),
  ])
  for (const r of [profileRes, answersRes, journeyRes, programmeRes]) if (r.error) throw r.error

  let weeks: Pick<FocusWeek, 'kind' | 'outcome'>[] = []
  if (programmeRes.data) {
    const { data, error } = await supabase
      .from('focus_weeks')
      .select('kind, outcome')
      .eq('programme_id', programmeRes.data.id)
    if (error) throw error
    weeks = (data ?? []) as Pick<FocusWeek, 'kind' | 'outcome'>[]
  }

  const answers = (answersRes.data ?? []) as OnboardingAnswer[]
  return {
    visible,
    isPremium,
    name: (profileRes.data?.full_name as string | null | undefined)?.split(' ')[0] ?? null,
    answers,
    signals: deriveUserSignals(answers, {}),
    journey: (journeyRes.data as JourneyRow | null) ?? null,
    weeks,
    foundationsStarted: !!programmeRes.data,
  }
}

export async function loadRecentDays(
  supabase: SupabaseClient,
  userId: string,
  today: string
): Promise<JourneyDayRow[]> {
  const { data, error } = await supabase
    .from('journey_days')
    .select('day, feeling, invitation_id, invitation_outcome')
    .eq('user_id', userId)
    .lte('day', today)
    .order('day', { ascending: false })
    .limit(14)
  if (error) throw error
  return (data ?? []) as JourneyDayRow[]
}
