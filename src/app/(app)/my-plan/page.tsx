import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { applyTierGating } from '@/lib/wellness-engine'
import { DISCLAIMER } from '@/lib/disclaimer'
import type { WellnessPlan, WellnessRecommendation } from '@/types/database'

const CATEGORY_CONFIG = {
  diet: { label: 'Diet & Nutrition', emoji: '🥗', bg: 'bg-blue-50', border: 'border-blue-100' },
  lifestyle: { label: 'Lifestyle', emoji: '🌿', bg: 'bg-green-50', border: 'border-green-100' },
  mindset: { label: 'Mindset & Wellbeing', emoji: '🧘', bg: 'bg-purple-50', border: 'border-purple-100' },
  supplement: { label: 'Supplements', emoji: '💊', bg: 'bg-amber-50', border: 'border-amber-100' },
}

const PRIORITY_DOT = {
  high: 'bg-red-400',
  medium: 'bg-amber-400',
  low: 'bg-green-400',
}

function RecommendationCard({ rec }: { rec: WellnessRecommendation }) {
  const config = CATEGORY_CONFIG[rec.category]
  return (
    <div className={`rounded-2xl p-4 border ${config.bg} ${config.border}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-semibold text-gray-900 text-sm leading-snug">{rec.title}</h3>
        <div className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${PRIORITY_DOT[rec.priority]}`} />
      </div>
      <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{rec.body}</p>
      {rec.disclaimer && (
        <p className="text-xs text-amber-700 mt-3 bg-amber-50 rounded-xl px-3 py-2 border border-amber-100">
          ⚠️ {rec.disclaimer}
        </p>
      )}
    </div>
  )
}

function CategorySection({
  title, emoji, recs,
}: { title: string; emoji: string; recs: WellnessRecommendation[] }) {
  if (recs.length === 0) return null
  return (
    <div>
      <h2 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
        <span>{emoji}</span> {title}
      </h2>
      <div className="space-y-3">
        {recs.map((rec) => (
          <RecommendationCard key={rec.id} rec={rec} />
        ))}
      </div>
    </div>
  )
}

export default async function MyPlanPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/sign-in')

  const { data: profile } = await supabase
    .from('profiles')
    .select('subscription_tier, full_name')
    .eq('id', user.id)
    .single()

  const { data: plan } = await supabase
    .from('wellness_plans')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()

  const tier = profile?.subscription_tier ?? 'free'
  const isPremium = tier === 'premium'

  const gatedPlan = plan
    ? applyTierGating(plan as unknown as WellnessPlan, tier)
    : null

  if (!gatedPlan) {
    return (
      <div className="py-12 text-center space-y-4">
        <div className="text-5xl">✨</div>
        <h1 className="text-xl font-bold text-brand-900">No plan yet</h1>
        <p className="text-gray-500 text-sm">
          Complete your intake to generate your personalised wellness plan.
        </p>
        <a
          href="/onboarding"
          className="inline-block bg-brand-900 text-white font-semibold px-6 py-3 rounded-2xl"
        >
          Start intake
        </a>
      </div>
    )
  }

  const totalRecs =
    gatedPlan.diet_adjustments.length +
    gatedPlan.lifestyle_adjustments.length +
    gatedPlan.mindset_recommendations.length +
    gatedPlan.supplement_suggestions.length

  return (
    <div className="space-y-8 py-4">
      <div>
        <h1 className="text-2xl font-bold text-brand-900">Your wellness plan</h1>
        <p className="text-gray-500 text-sm mt-1">
          {totalRecs} personalised recommendation{totalRecs !== 1 ? 's' : ''} for you
        </p>
      </div>

      {/* Free tier upgrade prompt */}
      {!isPremium && (
        <div className="bg-brand-50 border border-brand-200 rounded-2xl p-4">
          <p className="text-sm font-semibold text-brand-900">
            You&apos;re seeing your top 3 recommendations
          </p>
          <p className="text-sm text-brand-700 mt-1 mb-3">
            Upgrade to unlock your full plan including all diet, lifestyle,
            mindset, and supplement recommendations.
          </p>
          <a
            href="/pay"
            className="inline-block bg-brand-900 text-white text-sm font-semibold px-4 py-2 rounded-xl"
          >
            Unlock full plan — £7.99/month
          </a>
        </div>
      )}

      {/* Recommendations by category */}
      <CategorySection
        title={CATEGORY_CONFIG.diet.label}
        emoji={CATEGORY_CONFIG.diet.emoji}
        recs={gatedPlan.diet_adjustments}
      />
      <CategorySection
        title={CATEGORY_CONFIG.lifestyle.label}
        emoji={CATEGORY_CONFIG.lifestyle.emoji}
        recs={gatedPlan.lifestyle_adjustments}
      />
      <CategorySection
        title={CATEGORY_CONFIG.mindset.label}
        emoji={CATEGORY_CONFIG.mindset.emoji}
        recs={gatedPlan.mindset_recommendations}
      />
      {isPremium && (
        <CategorySection
          title={CATEGORY_CONFIG.supplement.label}
          emoji={CATEGORY_CONFIG.supplement.emoji}
          recs={gatedPlan.supplement_suggestions}
        />
      )}

      {/* GP signpost — always shown */}
      <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
        <p className="text-xs text-gray-500 leading-relaxed">
          {DISCLAIMER.gpSignpost}
        </p>
      </div>

      {/* Regenerate plan */}
      <div className="text-center pb-4">
        <p className="text-xs text-gray-400 mb-2">
          Updated your lifestyle or symptoms?
        </p>
        <a
          href="/onboarding"
          className="text-sm text-brand-700 font-medium underline"
        >
          Redo my intake to update my plan
        </a>
      </div>
    </div>
  )
}
