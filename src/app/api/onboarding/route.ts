import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sanitizeError } from '@/lib/sanitize-error'
import { rateLimit } from '@/lib/rate-limit'
import { z } from 'zod'

const AnswerSchema = z.object({
  question_key: z.string().min(1).max(100),
  answer_value: z.string().min(1).max(500),
})

const SaveAnswersSchema = z.object({
  answers: z.array(AnswerSchema).min(1).max(100),
})

export async function POST(request: NextRequest) {
  const { success } = rateLimit(request, { limit: 10, windowMs: 60_000 })
  if (!success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const parsed = SaveAnswersSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid answers format' }, { status: 400 })
    }

    const rows = parsed.data.answers.map((a) => ({
      user_id: user.id,
      question_key: a.question_key,
      answer_value: a.answer_value,
    }))

    // Delete then insert — cannot upsert because multiple rows share the same
    // question_key for array-type answers (symptoms, heritage, previously_tried).
    // The unique constraint is now on (user_id, question_key, answer_value).
    const { error: deleteError } = await supabase
      .from('onboarding_answers')
      .delete()
      .eq('user_id', user.id)
    if (deleteError) throw deleteError

    const { error } = await supabase
      .from('onboarding_answers')
      .insert(rows)

    if (error) throw error

    return NextResponse.json({ success: true }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const { success } = rateLimit(request, { limit: 30, windowMs: 60_000 })
  if (!success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('onboarding_answers')
    .select('*')
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: sanitizeError(error) }, { status: 500 })

  return NextResponse.json({ data })
}
