import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { matchFrameworks, buildPlan, applyTierGating } from '@/lib/wellness-engine'
import { loadFrameworks } from '@/lib/load-frameworks'
import { sanitizeError } from '@/lib/sanitize-error'
import { rateLimit } from '@/lib/rate-limit'

// GET — fetch active wellness plan
export async function GET(request: NextRequest) {
  const { success } = rateLimit(request, { limit: 30, windowMs: 60_000 })
  if (!success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('subscription_tier')
    .eq('id', user.id)
    .single()

  const { data: plan, error } = await supabase
    .from('wellness_plans')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()

  if (error || !plan) {
    return NextResponse.json({ data: null }, { status: 200 })
  }

  // Apply tier gating before returning
  const tier = profile?.subscription_tier ?? 'free'
  const gatedPlan = applyTierGating(plan as any, tier)

  return NextResponse.json({ data: { ...plan, ...gatedPlan } })
}

// POST — generate a new wellness plan from onboarding answers
export async function POST(request: NextRequest) {
  const { success } = rateLimit(request, { limit: 10, windowMs: 60_000 })
  if (!success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  const supabase = createClient()
  const admin = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

    // Run the engine
    const matchedFrameworks = matchFrameworks(answers ?? [], frameworks)
    const plan = buildPlan(matchedFrameworks, preferences ?? {})

    // Save the plan (deactivate_previous_plans trigger fires automatically)
    const { data: savedPlan, error: planError } = await admin
      .from('wellness_plans')
      .insert({
        user_id: user.id,
        ...plan,
        is_active: true,
        version: 1,
      })
      .select()
      .single()

    if (planError) throw planError

    return NextResponse.json({ data: savedPlan }, { status: 201 })
  } catch (err) {
    console.error('wellness-plan POST error:', err)
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 })
  }
}
