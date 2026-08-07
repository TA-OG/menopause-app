import { createClient } from '@/lib/supabase/server'
import { getUserAccess } from '@/lib/access'
import { redirect, notFound } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export default async function ArticlePage({
  params,
}: {
  params: { slug: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/sign-in')

  const { isPremium } = await getUserAccess(supabase, user.id)

  const { data: article } = await supabase
    .from('content_modules')
    .select('slug, title, body_md, tier, category, tags, estimated_read_minutes, published_at')
    .eq('slug', params.slug)
    .not('published_at', 'is', null)
    .lte('published_at', new Date().toISOString())
    .single()

  if (!article) notFound()

  const locked = article.tier === 'premium' && !isPremium

  return (
    <article className="space-y-5 py-4">
      <a href="/learn" className="text-sm text-brand-600 font-medium">
        ← Back to Learn
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
            {article.estimated_read_minutes} min read
          </p>
        )}
      </header>

      {locked ? (
        <div className="bg-brand-50 border border-brand-200 rounded-2xl p-5">
          <p className="font-semibold text-brand-900">This is a premium article</p>
          <p className="text-brand-700 text-sm mt-1 mb-3">
            Upgrade to read this and the full library of Pamela&apos;s in-depth guides.
          </p>
          <a
            href="/pay"
            className="inline-block bg-brand-900 text-white text-sm font-semibold px-4 py-2 rounded-xl"
          >
            Upgrade — £7.99/month
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
