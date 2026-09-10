import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import ArticleEditor, {
  type EditableArticle,
  type ArticleRevisionEntry,
} from '../ArticleEditor'

/**
 * Edit one Learn article.
 *
 * Loaded through the service-role client so a draft is readable here and
 * nowhere else — the reader-facing RLS policy (026) still hides it from the
 * app itself, including from an admin browsing /learn.
 */

export const dynamic = 'force-dynamic'

export default async function EditArticlePage({
  params,
}: {
  params: { id: string }
}) {
  const admin = createAdminClient()

  const { data: article, error } = await admin
    .from('content_modules')
    .select(
      'id, slug, title, body_md, tier, category, tags, estimated_read_minutes, published_at, updated_at',
    )
    .eq('id', params.id)
    .maybeSingle()

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
        Could not load this article: {error.message}
      </div>
    )
  }

  if (!article) notFound()

  const { data: revisions } = await admin
    .from('content_module_revisions')
    .select('id, action, actor_email, created_at')
    .eq('module_id', params.id)
    .order('created_at', { ascending: false })
    .limit(50)

  return (
    <div className="space-y-5">
      <div>
        <a href="/admin/articles" className="text-sm text-brand-600 font-medium">
          ← Back to articles
        </a>
      </div>

      <ArticleEditor
        article={article as EditableArticle}
        revisions={(revisions ?? []) as ArticleRevisionEntry[]}
      />
    </div>
  )
}
