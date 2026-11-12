import { pageTitle } from '@/lib/page-meta'
import { BookOpen, Globe, Sparkles, Stethoscope, Utensils } from 'lucide-react'
import IconBadge from '@/components/ui/IconBadge'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserAccess } from '@/lib/access'
import { getGeoAccess } from '@/lib/geo'
import { redirect } from 'next/navigation'
import { applyTierGating, attachPersonalNotes } from '@/lib/wellness-engine'
import { deriveUserSignals } from '@/lib/user-signals'
import { getLocale, getTranslations } from 'next-intl/server'
import {
  loadOverlay,
  loadEnglishIndex,
  localizeRecs,
  localizeCultural,
  type CeilingTranslator,
} from '@/lib/plan-content-i18n'
import PlanTabs from '@/components/plan/PlanTabs'
import type { WellnessPlan } from '@/types/database'

/**
 * Your plan — four tabs, collapsed cards.
 *
 * This page used to render every recommendation in one continuous column with
 * every word of every body expanded: 105+ cards and roughly 10,000 words, about
 * 45 minutes of reading, on a phone. The content was not the problem; the
 * delivery was. Nothing has been deleted here — it has been sorted and folded.
 */

export async function generateMetadata() {
  return pageTitle('MyPlan')
}

export default async function MyPlanPage({
  searchParams,
}: {
  searchParams: { tab?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/sign-in')

  const tDisclaimer = await getTranslations('Disclaimer')
  const t = await getTranslations('MyPlan')
  const { tier, isPremium } = await getUserAccess(supabase, user.id)

  // Jurisdiction gate — in 'info_only' regions the personalised plan is
  // withheld for compliance. Point the user to the educational library instead.
  const geo = await getGeoAccess(createAdminClient(), user.id)
  if (!geo.personalisedAllowed) {
    return (
      <div className="space-y-4 py-12 text-center">
        <IconBadge icon={BookOpen} className="mb-0" />
        <h1 className="text-xl font-bold text-brand-900">{t('regionTitle')}</h1>
        <p className="mx-auto max-w-sm text-base text-gray-600">{t('regionBody')}</p>
        <a
          href="/learn"
          className="inline-block rounded-2xl bg-brand-900 px-6 py-3 font-semibold text-white"
        >
          {t('exploreGuides')}
        </a>
      </div>
    )
  }

  const { data: plan } = await supabase
    .from('wellness_plans')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()

  if (!plan) {
    return (
      <div className="space-y-4 py-12 text-center">
        <IconBadge icon={Sparkles} className="mb-0" />
        <h1 className="text-xl font-bold text-brand-900">{t('noPlanTitle')}</h1>
        <p className="text-base text-gray-600">{t('noPlanBody')}</p>
        <a
          href="/onboarding"
          className="inline-block rounded-2xl bg-brand-900 px-6 py-3 font-semibold text-white"
        >
          {t('startIntake')}
        </a>
      </div>
    )
  }

  const gatedPlan = applyTierGating(plan as unknown as WellnessPlan, tier)

  // Cautions are re-derived from her CURRENT answers rather than read off the
  // stored plan. A plan generated months ago carries the flags she declared
  // then; if she has started anticoagulants since, the stored cautions would be
  // wrong in the direction that matters. See attachPersonalNotes().
  const { data: answers } = await supabase
    .from('onboarding_answers')
    .select('*')
    .eq('user_id', user.id)
  const { data: preferences } = await supabase
    .from('user_preferences')
    .select('*')
    .eq('user_id', user.id)
    .single()

  const signals = deriveUserSignals(answers ?? [], preferences ?? {})
  // Personal notes are matched against the ENGLISH copy first; only then is
  // the text swapped for her language (plan-content-i18n.ts).
  const locale = await getLocale()
  const overlay = loadOverlay(locale)
  const index = loadEnglishIndex()
  const tCard = await getTranslations('PlanCard')
  const withNotes = (recs: WellnessPlan['diet_adjustments']) =>
    localizeRecs(attachPersonalNotes(recs, signals), overlay, index, locale, tCard as unknown as CeilingTranslator)

  const diet = withNotes(gatedPlan.diet_adjustments)
  const lifestyle = withNotes(gatedPlan.lifestyle_adjustments)
  const mindset = withNotes(gatedPlan.mindset_recommendations)
  const supplements = isPremium ? withNotes(gatedPlan.supplement_suggestions) : []

  const totalRecs = diet.length + lifestyle.length + mindset.length + supplements.length
  const flagged = [...diet, ...lifestyle, ...mindset, ...supplements].filter(
    (r) => r.personal_note
  ).length

  // Cultural context — stored as JSONB on the plan
  const culturalContext: WellnessPlan['cultural_context'] =
    localizeCultural((plan as unknown as WellnessPlan)?.cultural_context ?? null, overlay, locale) ?? null
  const hasCulturalContext =
    culturalContext &&
    ((culturalContext.awareness?.length ?? 0) > 0 ||
      (culturalContext.diet?.length ?? 0) > 0 ||
      (culturalContext.lifestyle?.length ?? 0) > 0)

  return (
    <div className="space-y-5 py-4">
      <div>
        <h1 className="text-2xl font-bold text-brand-900">{t('title')}</h1>
        <p className="mt-1 text-base text-gray-600">{t('summary', { count: totalRecs })}</p>
        {/* Says plainly that her answers changed what she is looking at. */}
        {flagged > 0 && (
          <p className="mt-2 rounded-xl bg-blush-50 px-3 py-2 text-sm font-medium text-blush-900">
            <Stethoscope aria-hidden="true" className="mr-1.5 inline h-4 w-4 align-text-bottom" />
            {t('flaggedNotes', { count: flagged })}
          </p>
        )}
      </div>

      {/* Cultural awareness — shown first if present */}
      {hasCulturalContext &&
        culturalContext?.awareness?.map((item, i) => (
          <div key={i} className="rounded-2xl border border-brand-200 bg-brand-50 p-4">
            <p className="mb-2 flex items-start gap-2 text-base font-bold text-brand-900">
              <Globe aria-hidden="true" className="mt-0.5 h-4 w-4 flex-shrink-0" />
              {item.title}
            </p>
            <p className="whitespace-pre-line text-base leading-relaxed text-brand-800">
              {item.body}
            </p>
            {item.source && (
              <p className="mt-2 text-sm text-brand-700">{t('source', { source: item.source })}</p>
            )}
          </div>
        ))}

      {/* Free tier upgrade prompt */}
      {!isPremium && (
        <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4">
          <p className="text-base font-semibold text-brand-900">{t('freeTitle')}</p>
          <p className="mb-3 mt-1 text-base text-brand-800">{t('freeBody')}</p>
          <a
            href="/pay"
            className="inline-block rounded-xl bg-brand-900 px-4 py-2.5 text-base font-semibold text-white"
          >
            {t('freeCta')}
          </a>
        </div>
      )}

      <PlanTabs
        diet={diet}
        lifestyle={lifestyle}
        mindset={mindset}
        supplements={supplements}
        initialTab={searchParams.tab}
      />

      {/* Cultural food context — premium only */}
      {isPremium && hasCulturalContext && (culturalContext?.diet?.length ?? 0) > 0 && (
        <div>
          <h2 className="mb-3 flex items-center gap-2 font-bold text-gray-900">
            <Utensils aria-hidden="true" className="h-4 w-4" /> {t('cultureFoods')}
          </h2>
          <div className="space-y-3">
            {culturalContext!.diet!.map((item) => (
              <div key={item.id} className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                {item.title && (
                  <h3 className="mb-2 text-base font-semibold text-gray-900">{item.title}</h3>
                )}
                <p className="whitespace-pre-line text-base leading-relaxed text-gray-700">
                  {item.body}
                </p>
                {item.source && (
                  <p className="mt-2 text-sm text-gray-600">{t('source', { source: item.source })}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cultural lifestyle context */}
      {isPremium && hasCulturalContext && (culturalContext?.lifestyle?.length ?? 0) > 0 && (
        <div>
          <h2 className="mb-3 flex items-center gap-2 font-bold text-gray-900">
            <Sparkles aria-hidden="true" className="h-4 w-4" /> {t('cultureExperience')}
          </h2>
          <div className="space-y-3">
            {culturalContext!.lifestyle!.map((item) => (
              <div key={item.id} className="rounded-2xl border border-purple-100 bg-purple-50 p-4">
                <p className="whitespace-pre-line text-base leading-relaxed text-gray-700">
                  {item.body}
                </p>
                {item.source && (
                  <p className="mt-2 text-sm text-gray-600">{t('source', { source: item.source })}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* GP signpost — always shown */}
      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
        <p className="text-sm leading-relaxed text-gray-600">{tDisclaimer('gpSignpost')}</p>
      </div>

      <div className="pb-4 text-center">
        <p className="mb-2 text-sm text-gray-500">{t('updatedQuestion')}</p>
        <a href="/onboarding" className="text-base font-medium text-brand-700 underline">
          {t('redoIntake')}
        </a>
      </div>
    </div>
  )
}
