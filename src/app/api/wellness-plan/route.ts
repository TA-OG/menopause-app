import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserAccess } from '@/lib/access'
import { getGeoAccess } from '@/lib/geo'
import { matchFrameworks, buildPlan, applyTierGating } from '@/lib/wellness-engine'
import { loadFrameworks } from '@/lib/load-frameworks'
import { loadCulturalModifiers, buildCulturalContext } from '@/lib/cultural-engine'
import { sanitizeError } from '@/lib/sanitize-error'
import { rateLimit } from '@/lib/rate-limit'
import { withMonitoring, recordEvent } from '@/lib/monitoring'

// GET — fetch active wellness plan
async function getHandler(request: NextRequest) {
  const { success } = rateLimit(request, { limit: 30, windowMs: 60_000 })
  if (!success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Jurisdiction gate — in 'info_only' regions the personalised plan is
  // withheld for compliance; educational content (Learn) stays available.
  const geo = await getGeoAccess(createAdminClient(), user.id)
  if (!geo.personalisedAllowed) {
    return NextResponse.json({ data: null, geoBlocked: true, mode: geo.mode }, { status: 200 })
  }

  const { tier } = await getUserAccess(supabase, user.id)

  const { data: plan, error } = await supabase
    .from('wellness_plans')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()

  if (error || !plan) {
    return NextResponse.json({ data: null }, { status: 200 })
  }

  // Apply tier gating before returning (admins resolve to 'premium')
  const gatedPlan = applyTierGating(plan as any, tier)

  return NextResponse.json({ data: { ...plan, ...gatedPlan } })
}

// POST — generate a new wellness plan from onboarding answers
async function postHandler(request: NextRequest) {
  const { success } = rateLimit(request, { limit: 10, windowMs: 60_000 })
  if (!success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Jurisdiction gate — do not generate a personalised plan in 'info_only'
  // (or disabled) regions.
  const geo = await getGeoAccess(createAdminClient(), user.id)
  if (!geo.personalisedAllowed) {
    return NextResponse.json(
      { error: 'A personalised plan is not available in your region.', geoBlocked: true },
      { status: 403 },
    )
  }

  try {
    // Load user's onboarding answers
    const { data: answers, error: answersError } = await supabase
      .from('onboarding_answers')
      .select('*')
      .eq('user_id', user.id)

    if (answersError) throw answersError

    // Load user preferences
    const { data: preferences } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', user.id)
      .single()

    // Load all wellness frameworks from YAML
    const frameworks = await loadFrameworks()

    // Extract primary symptom for priority boosting
    const primarySymptom = (answers ?? [])
      .find((a) => a.question_key === 'primary_symptom')
      ?.answer_value

    // Run the engine
    const matchedFrameworks = matchFrameworks(answers ?? [], frameworks)
    const plan = buildPlan(matchedFrameworks, preferences ?? {}, primarySymptom)

    // Load cultural modifiers based on heritage answers + country
    const heritageAnswers = (answers ?? [])
      .filter((a) => a.question_key === 'heritage')
      .map((a) => a.answer_value)
    const countryCode = (answers ?? [])
      .find((a) => a.question_key === 'country')
      ?.answer_value
    const culturalModifiers = loadCulturalModifiers(heritageAnswers, countryCode)
    const culturalContext = buildCulturalContext(culturalModifiers)

    // Save the plan (deactivate_previous_plans trigger fires automatically)
    const { data: savedPlan, error: planError } = await supabase
      .from('wellness_plans')
      .insert({
        user_id: user.id,
        ...plan,
        is_active: true,
        version: 1,
        // Store cultural context as JSONB alongside the plan
        // This is surfaced separately on the my-plan page
        cultural_context: culturalContext,
      })
      .select()
      .single()

    if (planError) throw planError

    return NextResponse.json({ data: savedPlan }, { status: 201 })
  } catch (err) {
    console.error('wellness-plan POST error:', err)
    await recordEvent({
      type: 'error', route: '/api/wellness-plan', method: 'POST', status: 500,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack ?? null : null,
      userId: user.id,
    })
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 })
  }
}

export const GET = withMonitoring('/api/wellness-plan', getHandler)
export const POST = withMonitoring('/api/wellness-plan', postHandler)
