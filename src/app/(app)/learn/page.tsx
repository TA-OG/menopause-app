import { createClient } from '@/lib/supabase/server'
import { getUserAccess } from '@/lib/access'
import { getLocale, getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { pickLocalizedModules } from '@/lib/content-locale'

export default async function LearnPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/sign-in')

  const { isPremium } = await getUserAccess(supabase, user.id)
  const locale = await getLocale()
  const t = await getTranslations('Learn')

  // Fetch published content — free articles always, premium if subscribed.
  // Locale IN (current, 'en') so an untranslated article still shows up via
  // its English row instead of vanishing from the list; pickLocalizedModules
  // resolves the two possible rows per slug down to one.
  let query = supabase
    .from('content_modules')
    .select('id, slug, title, category, tags, tier, locale, estimated_read_minutes, published_at')
    .not('published_at', 'is', null)
    .in('locale', Array.from(new Set([locale, 'en'])))
    .order('published_at', { ascending: false })

  if (!isPremium) {
    query = query.eq('tier', 'free')
  }

  const { data: rawModules } = await query
  const modules = pickLocalizedModules(rawModules ?? [], locale)

  const freeModules = modules.filter((m) => m.tier === 'free')
  const premiumModules = modules.filter((m) => m.tier === 'premium')

  return (
    <div className="space-y-6 py-4">
      <div>
        <h1 className="text-2xl font-bold text-brand-900">{t('title')}</h1>
        <p className="text-gray-500 text-sm mt-1">
          {t('subtitle')}
        </p>
      </div>

      {/* Free articles */}
      {freeModules.length > 0 && (
        <section>
          <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide mb-3">
            {t('freeArticles')}
          </h2>
          <div className="space-y-3">
            {freeModules.map((module) => (
              <a
                key={module.id}
                href={`/learn/${module.slug}`}
                className="block bg-white rounded-2xl p-4 border border-gray-100 shadow-sm hover:border-brand-200 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <span className="text-xs text-brand-600 font-medium bg-brand-50 px-2 py-0.5 rounded-full">
                      {module.category}
                    </span>
                    <h3 className="font-semibold text-gray-900 mt-2 text-sm leading-snug">
                      {module.title}
                    </h3>
                  </div>
                  {module.estimated_read_minutes && (
                    <span className="text-xs text-gray-400 flex-shrink-0">
                      {t('minRead', { minutes: module.estimated_read_minutes })}
                    </span>
                  )}
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Premium articles */}
      {isPremium && premiumModules.length > 0 && (
        <section>
          <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide mb-3">
            {t('premiumArticles')}
          </h2>
          <div className="space-y-3">
            {premiumModules.map((module) => (
              <a
                key={module.id}
                href={`/learn/${module.slug}`}
                className="block bg-white rounded-2xl p-4 border border-gray-100 shadow-sm hover:border-brand-200 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <span className="text-xs text-blush-600 font-medium bg-blush-50 px-2 py-0.5 rounded-full">
                      {module.category}
                    </span>
                    <h3 className="font-semibold text-gray-900 mt-2 text-sm leading-snug">
                      {module.title}
                    </h3>
                  </div>
                  {module.estimated_read_minutes && (
                    <span className="text-xs text-gray-400 flex-shrink-0">
                      {t('minRead', { minutes: module.estimated_read_minutes })}
                    </span>
                  )}
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Upgrade prompt for free users */}
      {!isPremium && (
        <div className="bg-brand-50 border border-brand-200 rounded-2xl p-5">
          <p className="font-semibold text-brand-900">{t('unlockLibrary')}</p>
          <p className="text-brand-700 text-sm mt-1 mb-3">
            {t('unlockLibrarySubtitle')}
          </p>
          <a
            href="/pay"
            className="inline-block bg-brand-900 text-white text-sm font-semibold px-4 py-2 rounded-xl"
          >
            {t('upgrade')}
          </a>
        </div>
      )}

      {modules.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-400 text-sm">{t('comingSoon')}</p>
        </div>
      )}
    </div>
  )
}
