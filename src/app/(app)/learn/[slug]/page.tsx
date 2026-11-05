import { createClient } from '@/lib/supabase/server'
import { getUserAccess } from '@/lib/access'
import { getLocale, getTranslations } from 'next-intl/server'
import { redirect, notFound } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const ARTICLE_COLUMNS = 'slug, title, body_md, tier, category, tags, estimated_read_minutes, published_at'

export default async function ArticlePage({
  params,
}: {
  params: { slug: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/sign-in')

  const { isPremium } = await getUserAccess(supabase, user.id)
  const locale = await getLocale()
  const t = await getTranslations('Learn')

  const baseQuery = () =>
    supabase
      .from('content_modules')
      .select(ARTICLE_COLUMNS)
      .eq('slug', params.slug)
      .not('published_at', 'is', null)
      .lte('published_at', new Date().toISOString())

  // Try the requested locale first; an untranslated article falls back to
  // its English row rather than 404ing.
  let { data: article } = await baseQuery().eq('locale', locale).maybeSingle()
  if (!article && locale !== 'en') {
    ;({ data: article } = await baseQuery().eq('locale', 'en').maybeSingle())
  }

  if (!article) notFound()

  const locked = article.tier === 'premium' && !isPremium

  return (
    <article className="space-y-5 py-4">
      <a href="/learn" className="text-sm text-brand-600 font-medium">
        {t('backToLearn')}
      </a>

      <header>
        <span className="text-xs text-brand-600 font-medium bg-brand-50 px-2 py-0.5 rounded-full">
          {article.category}
        </span>
        <h1 className="text-2xl font-bold text-brand-900 mt-3 leading-snug">
          {article.title}
        </h1>
        {article.estimated_read_minutes && (
          <p className="text-xs text-gray-400 mt-1">
            {t('minReadFull', { minutes: article.estimated_read_minutes })}
          </p>
        )}
      </header>

      {locked ? (
        <div className="bg-brand-50 border border-brand-200 rounded-2xl p-5">
          <p className="font-semibold text-brand-900">{t('premiumArticleTitle')}</p>
          <p className="text-brand-700 text-sm mt-1 mb-3">
            {t('premiumArticleBody')}
          </p>
          <a
            href="/pay"
            className="inline-block bg-brand-900 text-white text-sm font-semibold px-4 py-2 rounded-xl"
          >
            {t('upgradeCta')}
          </a>
        </div>
      ) : (
        <div className="prose prose-sm max-w-none prose-headings:text-brand-900 prose-a:text-brand-600">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {article.body_md}
          </ReactMarkdown>
        </div>
      )}
    </article>
  )
}
