import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserAccess } from '@/lib/access'
import { getGeoAccess } from '@/lib/geo'
import { applyTierGating, attachPersonalNotes } from '@/lib/wellness-engine'
import { deriveUserSignals } from '@/lib/user-signals'
import type {
  FocusProgramme,
  FocusWeek,
  UserSignals,
  WellnessPlan,
  WellnessRecommendation,
} from '@/types/database'

/**
 * Everything a focus programme route needs about the signed-in user, loaded
 * once and in the same way /my-plan loads it — so the programme can never
 * show or choose from a different plan than the one she sees there.
 *
 * Gates, in order (decision 8 and the existing jurisdiction rule):
 *   region   personalised plans not allowed → 'geo'
 *   tier     not premium (admins count as premium) → 'not_premium'
 *   plan     no active plan yet → 'no_plan'
 */

export type FocusGate = 'geo' | 'not_premium' | 'no_plan'

type PlanCategories = Pick<
  WellnessPlan,
  | 'diet_adjustments'
  | 'lifestyle_adjustments'
  | 'mindset_recommendations'
  | 'supplement_suggestions'
>

export interface FocusContext {
  signals: UserSignals
  /** Her plan, tier-gated, with personal notes from her CURRENT answers. */
  plan: PlanCategories
  /** Every card in `plan`, by id. */
  planById: Map<string, WellnessRecommendation>
  programme: FocusProgramme | null
  /** All weeks of the active programme, in sequence order. */
  weeks: FocusWeek[]
}

export type FocusContextResult =
  | { ok: true; context: FocusContext }
  | { ok: false; gate: FocusGate }

export async function loadFocusContext(
  supabase: SupabaseClient,
  userId: string
): Promise<FocusContextResult> {
  const geo = await getGeoAccess(createAdminClient(), userId)
  if (!geo.personalisedAllowed) return { ok: false, gate: 'geo' }

  const { isPremium, tier } = await getUserAccess(supabase, userId)
  if (!isPremium) return { ok: false, gate: 'not_premium' }

  const { data: planRow, error: planError } = await supabase
    .from('wellness_plans')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle()
  if (planError) throw planError
  if (!planRow) return { ok: false, gate: 'no_plan' }

  const [answersRes, prefsRes, programmeRes] = await Promise.all([
    supabase.from('onboarding_answers').select('*').eq('user_id', userId),
    supabase.from('user_preferences').select('*').eq('user_id', userId).maybeSingle(),
    supabase
      .from('focus_programmes')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle(),
  ])
  if (answersRes.error) throw answersRes.error
  if (prefsRes.error) throw prefsRes.error
  if (programmeRes.error) throw programmeRes.error

  const signals = deriveUserSignals(answersRes.data ?? [], prefsRes.data ?? {})
  const gated = applyTierGating(planRow as unknown as WellnessPlan, tier)
  const withNotes = (recs: WellnessRecommendation[]) => attachPersonalNotes(recs, signals)
  const plan: PlanCategories = {
    diet_adjustments: withNotes(gated.diet_adjustments),
    lifestyle_adjustments: withNotes(gated.lifestyle_adjustments),
    mindset_recommendations: withNotes(gated.mindset_recommendations),
    supplement_suggestions: withNotes(gated.supplement_suggestions),
  }
  const planById = new Map(
    [
      ...plan.diet_adjustments,
      ...plan.lifestyle_adjustments,
      ...plan.mindset_recommendations,
      ...plan.supplement_suggestions,
    ].map((r) => [r.id, r])
  )

  const programme = (programmeRes.data as FocusProgramme | null) ?? null
  let weeks: FocusWeek[] = []
  if (programme) {
    const { data, error } = await supabase
      .from('focus_weeks')
      .select('*')
      .eq('programme_id', programme.id)
      .order('sequence', { ascending: true })
    if (error) throw error
    weeks = (data ?? []) as FocusWeek[]
  }

  return { ok: true, context: { signals, plan, planById, programme, weeks } }
}

/** The HTTP response for a closed gate. 403 for both access gates. */
export function gateResponseBody(gate: FocusGate): { error: string; gate: FocusGate } {
  const error =
    gate === 'geo'
      ? 'A personalised plan is not available in your region.'
      : gate === 'not_premium'
        ? 'The weekly programme is part of premium.'
        : 'Complete your intake to generate your plan first.'
  return { error, gate }
}

export function gateStatus(gate: FocusGate): 403 | 409 {
  return gate === 'no_plan' ? 409 : 403
}
