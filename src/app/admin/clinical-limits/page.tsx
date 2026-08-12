import { createAdminClient } from '@/lib/supabase/admin'
import { loadFrameworks } from '@/lib/load-frameworks'
import { loadSubstanceRegistry } from '@/lib/substance-registry'
import { buildLimitTopics, CLINICAL_LIMITS_ROUND } from '@/lib/clinical-limits-config'
import type { WellnessRecommendation } from '@/types/database'
import ClinicalLimitsForm from './ClinicalLimitsForm'

export const dynamic = 'force-dynamic'

export default async function ClinicalLimitsPage() {
  const [frameworks, substances] = await Promise.all([
    loadFrameworks(),
    Promise.resolve(loadSubstanceRegistry()),
  ])

  // Index every supplement so each question can show the copy users see today.
  const supplementsById = new Map<string, WellnessRecommendation>()
  for (const framework of frameworks) {
    for (const supplement of framework.supplement_suggestions ?? []) {
      supplementsById.set(supplement.id, supplement)
    }
  }

  const topics = buildLimitTopics(substances, supplementsById)
  const verifiedCount = substances.filter((s) => s.limit_status === 'verified').length

  const admin = createAdminClient()
  const { data: rows, error } = await admin
    .from('content_intake_responses')
    .select('topic_id, question_id, answer')
    .eq('round', CLINICAL_LIMITS_ROUND)

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

  const savedAnswers: Record<string, Record<string, string>> = {}
  for (const r of rows ?? []) {
    if (!savedAnswers[r.topic_id]) savedAnswers[r.topic_id] = {}
    if (r.answer) savedAnswers[r.topic_id][r.question_id] = r.answer
  }

  return (
    <ClinicalLimitsForm
      topics={topics}
      savedAnswers={savedAnswers}
      verifiedCount={verifiedCount}
    />
  )
}
