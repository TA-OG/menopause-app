import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { QUESTIONS, FOUNDATION_ROUND } from '@/lib/content-intake-config'

/**
 * Saves one topic's worth of intake answers for the admin questionnaire.
 * Body: { topicId, topicLabel, answers: { [questionId]: string } }
 *
 * Upserts on (topic_id, question_id, round) so re-saving edits in place,
 * while a different round (e.g. the Fathom interview) stays separate.
 */
export async function POST(request: NextRequest) {
  // 1. Verify the caller is an authenticated admin
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 2. Parse and validate body
  let body: { topicId?: string; topicLabel?: string; answers?: Record<string, string> }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const topicId = body.topicId?.trim()
  const topicLabel = body.topicLabel?.trim()
  const answers = body.answers ?? {}

  if (!topicId || !topicLabel) {
    return NextResponse.json({ error: 'Missing topic' }, { status: 400 })
  }

  // 3. Build one row per known question. question_text comes from config so
  //    storage always reflects the current wording; answers from the body.
  const rows = QUESTIONS.map((q) => ({
    topic_id: topicId,
    topic_label: topicLabel,
    question_id: q.id,
    question_text: q.prompt,
    answer: (answers[q.id] ?? '').toString(),
    round: FOUNDATION_ROUND,
    author_id: user.id,
  }))

  const admin = createAdminClient()
  const { error } = await admin
    .from('content_intake_responses')
    .upsert(rows, { onConflict: 'topic_id,question_id,round' })

  if (error) {
    console.error('Intake save error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
