import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserAccess } from '@/lib/access'
import { getGeoAccess } from '@/lib/geo'
import { syncSubscriptionFromStripe } from '@/lib/subscription-sync'
import {
  applyTierGating,
  attachPersonalNotes,
  selectFocus,
} from '@/lib/wellness-engine'
import { deriveUserSignals } from '@/lib/user-signals'
import { redirect } from 'next/navigation'
import Greeting from '@/components/ui/Greeting'
import RefreshSubscriptionButton from '@/components/ui/RefreshSubscriptionButton'
import type { WellnessPlan } from '@/types/database'

/**
 * Home — the few things worth doing, not the whole library.
 *
 * The old dashboard said "Your personalised plan is ready" and pointed at
 * /my-plan, so the only way to see any recommendation was to open a 105-card
 * list. Everything a woman needed on a given day was two taps and a long scroll
 * away.
 *
 * This surfaces the top few directly, chosen ACROSS categories by
 * selectFocus() — which is the only way signals like diet_type and
 * previously_tried can matter at all, since a plan is stored as four separate
 * arrays and a signal that lifts every diet card equally reorders none of them.
 *
 * The full plan is still one tap away; it just stops being the front door.
 */

/** How many suggestions lead the page. */
const FOCUS_COUNT = 3

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { upgraded?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/sign-in')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'

  // Just returned from Stripe checkout — the webhook may not have landed
  // yet, or may have failed to resolve the user (see migration 023 and
  // api/stripe/webhook/route.ts). Re-derive the truth straight from Stripe
  // before deciding whether to show the upgrade prompt, so a paying user
  // never lands here and sees "Upgrade" right after paying.
  if (searchParams.upgraded === 'true') {
    try {
      await syncSubscriptionFromStripe(createAdminClient(), user.id)
    } catch (err) {
      console.error('post-checkout subscription sync failed:', err)
    }
  }

  const { tier, isPremium } = await getUserAccess(supabase, user.id)

  // Same jurisdiction gate the plan page enforces — in 'info_only' regions no
  // personalised recommendation may be surfaced, including here.
  const geo = await getGeoAccess(createAdminClient(), user.id)

  let focus: WellnessPlan['diet_adjustments'] = []
  let planTotal = 0

  if (geo.personalisedAllowed) {
    const { data: plan } = await supabase
      .from('wellness_plans')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    if (plan) {
      const gated = applyTierGating(plan as unknown as WellnessPlan, tier)

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

      // Notes re-attached from her CURRENT answers, for the same reason the
      // plan page does it: a caution has to reflect what she has told us most
      // recently, not what was true when the plan was generated.
      const noted = {
        diet_adjustments: attachPersonalNotes(gated.diet_adjustments, signals),
        lifestyle_adjustments: attachPersonalNotes(gated.lifestyle_adjustments, signals),
        mindset_recommendations: attachPersonalNotes(gated.mindset_recommendations, signals),
        supplement_suggestions: attachPersonalNotes(gated.supplement_suggestions, signals),
      }

      planTotal =
        noted.diet_adjustments.length +
        noted.lifestyle_adjustments.length +
        noted.mindset_recommendations.length +
        noted.supplement_suggestions.length

      focus = selectFocus(noted, signals, FOCUS_COUNT)
    }
  }

  return (
    <div className="space-y-5 py-4">
      {/* Greeting — client component so it uses the user's local device time */}
      <Greeting firstName={firstName} />

      {/* ── Start here ──────────────────────────────────────────────────── */}
      {focus.length > 0 && (
        <section aria-labelledby="focus-heading" className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="focus-heading" className="font-bold text-brand-900">
              Start here
            </h2>
            <a href="/my-plan" className="text-sm font-medium text-brand-700">
              All {planTotal} →
            </a>
          </div>

          <ol className="flex flex-col gap-3">
            {focus.map((rec, i) => (
              <li key={rec.id}>
                <a
                  href={`/my-plan?tab=${CATEGORY_TAB[rec.category]}`}
                  className="flex min-h-11 gap-3 rounded-2xl border border-gray-200 bg-white p-4 transition-colors hover:border-brand-300"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-brand-900 text-sm font-bold text-white"
                  >
                    {i + 1}
                  </span>
                  <span className="flex flex-col gap-1">
                    <span className="text-base font-semibold leading-snug text-gray-900">
                      {rec.title}
                    </span>
                    {/* A caution she declared travels with the card wherever it
                        appears — including here, where it is only a summary. */}
                    {rec.personal_note && (
                      <span className="text-sm font-medium text-blush-800">
                        🩺 Read the note on this one before you start
                      </span>
                    )}
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* No plan yet, or a region where we can't personalise */}
      {focus.length === 0 && (
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Your wellness plan</h2>
            <a href="/my-plan" className="text-sm font-medium text-brand-700">
              View →
            </a>
          </div>
          <p className="text-base text-gray-600">
            {geo.personalisedAllowed
              ? 'Complete your intake to see your personalised plan.'
              : 'Personalised plans aren’t available in your region yet — the guides are.'}
          </p>
        </div>
      )}

      {/* Daily check-in prompt */}
      <a
        href="/symptom-checkin"
        className="block rounded-2xl bg-brand-900 p-5 text-white transition-colors hover:bg-brand-800"
      >
        <p className="text-lg font-semibold">Log today&apos;s symptoms</p>
        <p className="mt-1 text-base text-brand-200">
          Track how you&apos;re doing and see your progress over time
        </p>
      </a>

      {/* Journal shortcut */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Journal</h2>
          <a href="/journal" className="text-sm font-medium text-brand-700">
            Open →
          </a>
        </div>
        <p className="text-base text-gray-600">
          Track what you&apos;re trying and how it&apos;s working for you.
        </p>
      </div>

      {/* Referral promo */}
      <a
        href="/refer"
        className="block rounded-2xl border border-brand-200 bg-brand-50 p-5 transition-colors hover:bg-brand-100"
      >
        <p className="font-semibold text-brand-900">
          🎁 Invite a friend, get a free month
        </p>
        <p className="mt-1 text-base text-brand-800">
          You both get one month free — stack up to 6 referrals.
        </p>
      </a>

      {/* Upgrade prompt for free users */}
      {!isPremium && (
        <div className="rounded-2xl border border-blush-200 bg-blush-50 p-5">
          <p className="font-semibold text-blush-800">Unlock your full plan</p>
          <p className="mb-3 mt-1 text-base text-blush-700">
            Get access to all recommendations, content, and your complete journal
            history.
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <a
              href="/pay"
              className="inline-block rounded-xl bg-blush-600 px-4 py-2.5 text-base font-semibold text-white transition-colors hover:bg-blush-700"
            >
              Upgrade — £7.99/month
            </a>
            <RefreshSubscriptionButton />
          </div>
        </div>
      )}
    </div>
  )
}

/** Which tab a focus item lives in, so tapping it lands on the right one. */
const CATEGORY_TAB: Record<string, string> = {
  diet: 'diet',
  lifestyle: 'lifestyle',
  mindset: 'mindset',
  supplement: 'supplements',
}
