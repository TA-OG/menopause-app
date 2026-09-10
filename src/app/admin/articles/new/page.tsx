import ArticleEditor from '../ArticleEditor'

/**
 * Write a new Learn article.
 *
 * Nothing exists in the database until the first save, and nothing reaches a
 * reader until Publish — so leaving this page without saving simply discards
 * the draft, which is the behaviour someone half-way through an idea expects.
 */

export const dynamic = 'force-dynamic'

export default function NewArticlePage() {
  return (
    <div className="space-y-5">
      <div>
        <a href="/admin/articles" className="text-sm text-brand-600 font-medium">
          ← Back to articles
        </a>
        <h2 className="text-xl font-bold text-brand-900 mt-2">New article</h2>
        <p className="text-sm text-gray-500 mt-1">
          This stays private until you publish it.
        </p>
      </div>

      <ArticleEditor />
    </div>
  )
}
