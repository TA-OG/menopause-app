import { createAdminClient } from '@/lib/supabase/admin'
import { TOPICS, FOUNDATION_ROUND, type IntakeTopic } from '@/lib/content-intake-config'
import IntakeForm from './IntakeForm'

export const dynamic = 'force-dynamic'

export interface SavedTopic {
  topicId: string
  topicLabel: string
  answers: Record<string, string>
}

export default async function IntakePage() {
  const admin = createAdminClient()

  const { data: rows, error } = await admin
    .from('content_intake_responses')
    .select('topic_id, topic_label, question_id, answer')
    .eq('round', FOUNDATION_ROUND)

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
        Failed to load saved answers: {error.message}
        <p className="mt-2 text-xs text-red-500">
          If this is the first run, the content_intake_responses table may not exist yet —
          apply migration 016_content_intake.sql.
        </p>
      </div>
    )
  }

  // Group flat rows → one entry per topic with its answers map.
  const byTopic = new Map<string, SavedTopic>()
  for (const r of rows ?? []) {
    let entry = byTopic.get(r.topic_id)
    if (!entry) {
      entry = { topicId: r.topic_id, topicLabel: r.topic_label, answers: {} }
      byTopic.set(r.topic_id, entry)
    }
    if (r.answer) entry.answers[r.question_id] = r.answer
  }

  // Custom topics Pamela added that aren't in the predefined config list.
  const known = new Set(TOPICS.map((t) => t.id))
  const customTopics: IntakeTopic[] = Array.from(byTopic.values())
    .filter((t) => !known.has(t.topicId))
    .map((t) => ({ id: t.topicId, label: t.topicLabel }))

  return (
    <IntakeForm
      saved={Array.from(byTopic.values())}
      customTopics={customTopics}
    />
  )
}
