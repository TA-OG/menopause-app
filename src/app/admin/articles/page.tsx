import { createAdminClient } from '@/lib/supabase/admin'
import { publicationState, type PublicationState } from '@/lib/article-authoring'
import { FileText, Plus } from 'lucide-react'
import type { ContentTier } from '@/types/database'

/**
 * Pamela's article library.
 *
 * Reads through the service-role client because drafts are invisible to every
 * other client by RLS (026) — the reader app only ever sees published
 * articles, and that stays true while she works.
 */

export const dynamic = 'force-dynamic'

interface ArticleRow {
  id: string
  slug: string
  title: string
  tier: ContentTier
  category: string
  estimated_read_minutes: number | null
  published_at: string | null
  updated_at: string
}

export default async function ArticlesPage() {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('content_modules')
    .select('id, slug, title, tier, category, estimated_read_minutes, published_at, updated_at')
    .order('updated_at', { ascending: false })

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
        Could not load the articles: {error.message}
      </div>
    )
  }

  const articles = (data ?? []) as ArticleRow[]
  const byState = (s: PublicationState) =>
    articles.filter((a) => publicationState(a.published_at) === s)

  const live = byState('live')
  const scheduled = byState('scheduled')
  const drafts = byState('draft')

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-brand-900">Articles</h2>
          <p className="text-sm text-gray-500 mt-1 max-w-2xl">
            Everything in the Learn section of the app. Write an article here, publish
            it when you are happy with it, and it appears for women using the app
            straight away. Unpublish takes it back down just as quickly.
          </p>
        </div>
        <a
          href="/admin/articles/new"
          className="text-sm bg-brand-900 text-white px-4 py-2 rounded-xl hover:bg-brand-800 transition-colors whitespace-nowrap flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> New article
        </a>
      </div>

      {articles.length === 0 ? (
        <EmptyLibrary />
      ) : (
        <div className="space-y-6">
          <Section title="Live" hint="Readable in the app right now" articles={live} />
          <Section title="Scheduled" hint="Goes live on its own" articles={scheduled} />
          <Section title="Drafts" hint="Only you can see these" articles={drafts} />
        </div>
      )}
    </div>
  )
}

function EmptyLibrary() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
      <FileText className="w-8 h-8 text-brand-300 mx-auto" />
      <p className="text-sm font-medium text-gray-800 mt-3">
        There are no articles yet
      </p>
      <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
        The Learn section of the app is empty because nothing has been written into
        it. Anything you write here stays a private draft until you press Publish.
      </p>
      <a
        href="/admin/articles/new"
        className="inline-flex items-center gap-1.5 text-sm bg-brand-900 text-white px-4 py-2 rounded-xl hover:bg-brand-800 transition-colors mt-4"
      >
        <Plus className="w-4 h-4" /> Write the first one
      </a>
    </div>
  )
}

function Section({
  title,
  hint,
  articles,
}: {
  title: string
  hint: string
  articles: ArticleRow[]
}) {
  if (articles.length === 0) return null

  return (
    <section>
      <div className="flex items-baseline gap-2 mb-2">
        <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">
          {title} ({articles.length})
        </h3>
        <span className="text-xs text-gray-400">{hint}</span>
      </div>

      <div className="space-y-2">
        {articles.map((article) => (
          <a
            key={article.id}
            href={`/admin/articles/${article.id}`}
            className="block bg-white rounded-2xl p-4 border border-gray-100 shadow-sm hover:border-brand-200 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-brand-600 font-medium bg-brand-50 px-2 py-0.5 rounded-full">
                    {article.category}
                  </span>
                  {article.tier === 'premium' && (
                    <span className="text-xs text-amber-700 font-medium bg-amber-50 px-2 py-0.5 rounded-full">
                      Premium
                    </span>
                  )}
                </div>
                <p className="font-semibold text-gray-900 mt-1.5 text-sm leading-snug truncate">
                  {article.title}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  /learn/{article.slug}
                  {article.estimated_read_minutes
                    ? ` · ${article.estimated_read_minutes} min read`
                    : ''}
                </p>
              </div>
              <span className="text-xs text-gray-400 whitespace-nowrap">
                edited {new Date(article.updated_at).toLocaleDateString('en-GB')}
              </span>
            </div>
          </a>
        ))}
      </div>
    </section>
  )
}
