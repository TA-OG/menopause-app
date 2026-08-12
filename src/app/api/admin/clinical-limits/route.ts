import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin-auth'
import { sanitizeError } from '@/lib/sanitize-error'
import { LIMIT_QUESTIONS, CLINICAL_LIMITS_ROUND } from '@/lib/clinical-limits-config'
import { loadSubstanceRegistry } from '@/lib/substance-registry'

/**
 * Save one substance's clinical-limit answers.
 * Body: { substanceKey, substanceLabel, answers: { [questionId]: string } }
 *
 * Stored in content_intake_responses under the `clinical_limits` round, keyed
 * by (topic_id = substance key, question_id, round) — so re-saving edits in
 * place and the content questionnaire's `foundation` round is untouched.
 *
 * Saving here records a PROPOSAL. It does not change what the app tells anyone:
 * a developer transcribes signed-off figures into substances.yaml, where
 * validation refuses a ceiling that has no source.
 */
export async function POST(request: NextRequest) {
  const supabase = createClient()
  const auth = await requireAdmin(supabase)
  if (auth instanceof NextResponse) return auth

  let body: {
    substanceKey?: string
    substanceLabel?: string
    answers?: Record<string, string>
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const substanceKey = body.substanceKey?.trim()
  const answers = body.answers ?? {}

  if (!substanceKey) {
    return NextResponse.json({ error: 'Missing substance' }, { status: 400 })
  }

  // Resolve against the registry rather than trusting the client. The stored
  // topic_id is what a developer later transcribes a signed-off limit against,
  // so a typo or a stale tab must not create a review record pointing at a
  // substance that does not exist. The label comes from the registry too, so it
  // cannot drift from display_name.
  const entry = loadSubstanceRegistry().find((s) => s.key === substanceKey)
  if (!entry) {
    return NextResponse.json({ error: 'Unknown substance' }, { status: 400 })
  }
  const substanceLabel = entry.display_name

  // A proposed ceiling with no source is exactly what this whole mechanism
  // exists to prevent, so refuse the combination rather than storing it.
  const maxDaily = (answers.max_daily ?? '').trim()
  const source = (answers.source ?? '').trim()
  if (maxDaily && !source) {
    return NextResponse.json(
      {
        error:
          'A maximum daily amount needs a source. Please say where the figure comes from, or leave both blank.',
      },
      { status: 400 },
    )
  }

  // question_text comes from config, so stored rows always reflect the current
  // wording rather than whatever the browser happened to send.
  const rows = LIMIT_QUESTIONS.map((q) => ({
    topic_id: substanceKey,
    topic_label: substanceLabel,
    question_id: q.id,
    question_text: q.prompt,
    answer: (answers[q.id] ?? '').toString(),
    round: CLINICAL_LIMITS_ROUND,
    author_id: auth.id,
  }))

  try {
    const admin = createAdminClient()
    const { error } = await admin
      .from('content_intake_responses')
      .upsert(rows, { onConflict: 'topic_id,question_id,round' })

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 })
  }
}
