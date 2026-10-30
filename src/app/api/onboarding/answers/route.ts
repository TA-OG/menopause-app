import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { sanitizeError } from '@/lib/sanitize-error'
import { rateLimit } from '@/lib/rate-limit'
import { validateAnswerUpdate } from '@/lib/onboarding-answers'

export const dynamic = 'force-dynamic'

const UpdateSchema = z.object({
  question_key: z.string().min(1).max(100),
  values: z.array(z.string().max(500)).max(30),
})

/**
 * PUT /api/onboarding/answers  { question_key, values }
 *
 * Replace her answer to ONE question, leaving every other answer as it is.
 * Used by the journey's short intake sessions and by the safety questions
 * (src/lib/safety-review.ts). POST /api/onboarding still replaces everything.
 *
 * Delete then insert, as POST does, because a multi-select is one row per
 * choice. Not one transaction: if the insert fails after the delete, the
 * question is left unanswered — the safe direction, since the safety gate and
 * the engine both treat an unanswered question as unknown, never as "none".
 */
export async function PUT(request: NextRequest) {
  const { success } = await rateLimit(request, { limit: 60, windowMs: 60_000 })
  if (!success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = UpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid answer format' }, { status: 400 })
  }

  const update = validateAnswerUpdate(parsed.data.question_key, parsed.data.values)
  if (!update.ok) return NextResponse.json({ error: update.error }, { status: 400 })

  try {
    const { error: deleteError } = await supabase
      .from('onboarding_answers')
      .delete()
      .eq('user_id', user.id)
      .eq('question_key', update.key)
    if (deleteError) throw deleteError

    if (update.values.length > 0) {
      const { error } = await supabase.from('onboarding_answers').insert(
        update.values.map((answer_value) => ({
          user_id: user.id,
          question_key: update.key,
          answer_value,
        }))
      )
      if (error) throw error
    }

    // The same dedicated columns the full save writes (onboarding-config.ts,
    // "Persistence mapping"). Each is single-valued and required, so there is
    // always exactly one value here when the key maps to a column.
    const single = update.values[0]
    if (update.profileKey && single !== undefined) {
      const { error } = await supabase
        .from('profiles')
        .update({ [update.profileKey]: single })
        .eq('id', user.id)
      if (error) throw error
    }
    if (update.preferenceKey && single !== undefined) {
      const { error } = await supabase
        .from('user_preferences')
        .upsert({ user_id: user.id, [update.preferenceKey]: single }, { onConflict: 'user_id' })
      if (error) throw error
    }

    return NextResponse.json({ data: { question_key: update.key, values: update.values } })
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 })
  }
}
