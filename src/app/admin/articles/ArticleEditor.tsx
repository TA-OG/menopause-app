'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Eye, Pencil, Trash2, ExternalLink } from 'lucide-react'
import RichTextEditor from './RichTextEditor'
import {
  slugify,
  publicationState,
  checkPublishReadiness,
  estimateReadMinutes,
  slugChangeBreaksLinks,
  SUGGESTED_CATEGORIES,
  MAX_TITLE_LENGTH,
  type PublicationState,
} from '@/lib/article-authoring'
import type { ContentTier } from '@/types/database'

/**
 * Write, edit and publish one Learn article.
 *
 * The same component serves a new article and an existing one — the only
 * difference is whether there is an id yet, and creating one is the first
 * save. Keeping them together means the writing experience cannot drift apart
 * between "new" and "edit", which is where these screens usually diverge.
 */

export interface EditableArticle {
  id: string
  slug: string
  title: string
  body_md: string
  tier: ContentTier
  category: string
  tags: string[]
  estimated_read_minutes: number | null
  published_at: string | null
  updated_at: string
}

export interface ArticleRevisionEntry {
  id: string
  action: string
  actor_email: string | null
  created_at: string
}

interface ArticleEditorProps {
  /** Absent when writing a new article. */
  article?: EditableArticle
  revisions?: ArticleRevisionEntry[]
}

type Saving = 'idle' | 'saving' | 'publishing' | 'deleting'

const EMPTY_DRAFT = {
  title: '',
  slug: '',
  body_md: '',
  tier: 'free' as ContentTier,
  category: '',
  tags: [] as string[],
}

export default function ArticleEditor({ article, revisions = [] }: ArticleEditorProps) {
  const router = useRouter()

  const [id, setId] = useState<string | null>(article?.id ?? null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(article?.updated_at ?? null)
  const [publishedAt, setPublishedAt] = useState<string | null>(article?.published_at ?? null)

  const [title, setTitle] = useState(article?.title ?? EMPTY_DRAFT.title)
  const [slug, setSlug] = useState(article?.slug ?? EMPTY_DRAFT.slug)
  const [bodyMd, setBodyMd] = useState(article?.body_md ?? EMPTY_DRAFT.body_md)
  const [tier, setTier] = useState<ContentTier>(article?.tier ?? EMPTY_DRAFT.tier)
  const [category, setCategory] = useState(article?.category ?? EMPTY_DRAFT.category)
  const [tagsText, setTagsText] = useState((article?.tags ?? []).join(', '))

  // Whether the author has taken control of the slug. Until she does, it
  // follows the title — retyping a title should not leave a stale URL behind.
  const [slugTouched, setSlugTouched] = useState(Boolean(article))

  const [saving, setSaving] = useState<Saving>('idle')
  const [error, setError] = useState<string | null>(null)
  const [problems, setProblems] = useState<string[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [preview, setPreview] = useState(false)
  const [dirty, setDirty] = useState(false)

  const state: PublicationState = publicationState(publishedAt)
  const readiness = useMemo(
    () => checkPublishReadiness({ title, body_md: bodyMd, category }),
    [title, bodyMd, category],
  )

  const tags = useMemo(
    () => tagsText.split(',').map((t) => t.trim()).filter(Boolean),
    [tagsText],
  )

  // Keep the slug in step with the title until it is edited by hand.
  useEffect(() => {
    if (!slugTouched) setSlug(slugify(title))
  }, [title, slugTouched])

  // Warn before losing unsaved work. Browsers show their own wording.
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const touch = useCallback(() => {
    setDirty(true)
    setNotice(null)
  }, [])

  /** Create on first save, update thereafter. Returns the article id. */
  const save = useCallback(async (): Promise<string | null> => {
    setSaving('saving')
    setError(null)
    setProblems([])

    try {
      const payload = {
        title: title.trim(),
        slug: slug || slugify(title),
        body_md: bodyMd,
        tier,
        category: category.trim(),
        tags,
        estimated_read_minutes: estimateReadMinutes(bodyMd),
      }

      const response = id
        ? await fetch(`/api/admin/articles/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...payload, expected_updated_at: updatedAt }),
          })
        : await fetch('/api/admin/articles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error ?? 'That did not save. Please try again.')
        return null
      }

      const saved = data.article as EditableArticle
      setId(saved.id)
      setUpdatedAt(saved.updated_at)
      setPublishedAt(saved.published_at)
      setSlug(saved.slug)
      setDirty(false)
      setNotice('Saved.')

      // A new article gets its own URL, so a refresh reopens it rather than
      // starting a second blank one.
      if (!id) router.replace(`/admin/articles/${saved.id}`)
      else router.refresh()

      return saved.id
    } catch (err) {
      console.error('Save failed', err)
      setError('Could not reach the server. Check your connection and try again.')
      return null
    } finally {
      setSaving('idle')
    }
  }, [id, title, slug, bodyMd, tier, category, tags, updatedAt, router])

  const changePublication = useCallback(
    async (action: 'publish' | 'unpublish') => {
      // Save first: publishing what is on screen, not what was last saved, is
      // the only behaviour that matches what the author thinks she is doing.
      const articleId = dirty || !id ? await save() : id
      if (!articleId) return

      setSaving('publishing')
      setError(null)
      setProblems([])

      try {
        const response = await fetch(`/api/admin/articles/${articleId}/publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        })
        const data = await response.json()

        if (!response.ok) {
          setError(data.error ?? 'That did not work. Please try again.')
          setProblems(Array.isArray(data.problems) ? data.problems : [])
          return
        }

        const saved = data.article as EditableArticle
        setPublishedAt(saved.published_at)
        setUpdatedAt(saved.updated_at)
        setNotice(
          action === 'publish'
            ? 'Published. Women using the app can read this now.'
            : 'Unpublished. It is no longer visible in the app.',
        )
        router.refresh()
      } catch (err) {
        console.error('Publish failed', err)
        setError('Could not reach the server. Check your connection and try again.')
      } finally {
        setSaving('idle')
      }
    },
    [dirty, id, save, router],
  )

  const remove = useCallback(async () => {
    if (!id) return
    if (!window.confirm('Delete this draft? Its history is kept, but the draft itself goes.')) return

    setSaving('deleting')
    setError(null)
    try {
      const response = await fetch(`/api/admin/articles/${id}`, { method: 'DELETE' })
      const data = await response.json()
      if (!response.ok) {
        setError(data.error ?? 'That did not delete. Please try again.')
        return
      }
      setDirty(false)
      router.push('/admin/articles')
    } catch (err) {
      console.error('Delete failed', err)
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setSaving('idle')
    }
  }, [id, router])

  const busy = saving !== 'idle'
  const slugWarning =
    article && slugChangeBreaksLinks({ slug: article.slug, published_at: publishedAt }, slug)

  return (
    <div className="space-y-5">
      <StatusBanner state={state} publishedAt={publishedAt} slug={slug} />

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-sm text-red-700 font-medium">{error}</p>
          {problems.length > 0 && (
            <ul className="mt-2 space-y-1">
              {problems.map((p) => (
                <li key={p} className="text-sm text-red-700">• {p}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {notice && !error && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3">
          <p className="text-sm text-green-800">{notice}</p>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
        <div>
          <label htmlFor="article-title" className="block text-sm font-medium text-gray-800 mb-1">
            Title
          </label>
          <input
            id="article-title"
            value={title}
            maxLength={MAX_TITLE_LENGTH}
            disabled={busy}
            onChange={(e) => { setTitle(e.target.value); touch() }}
            placeholder="What is this article about?"
            className="w-full text-lg font-semibold border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-brand-400"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="article-category" className="block text-sm font-medium text-gray-800 mb-1">
              Category
            </label>
            <input
              id="article-category"
              list="article-categories"
              value={category}
              disabled={busy}
              onChange={(e) => { setCategory(e.target.value); touch() }}
              placeholder="Symptoms"
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-brand-400"
            />
            <datalist id="article-categories">
              {SUGGESTED_CATEGORIES.map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>

          <fieldset>
            <legend className="block text-sm font-medium text-gray-800 mb-1">Who can read it</legend>
            <div className="flex gap-2">
              {(['free', 'premium'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  disabled={busy}
                  onClick={() => { setTier(value); touch() }}
                  className={[
                    'flex-1 text-sm px-3 py-2 rounded-xl border transition-colors',
                    tier === value
                      ? 'bg-brand-900 text-white border-brand-900'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-brand-300',
                  ].join(' ')}
                >
                  {value === 'free' ? 'Everyone' : 'Premium only'}
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="article-slug" className="block text-sm font-medium text-gray-800 mb-1">
              Web address
            </label>
            <div className="flex items-center gap-1 text-sm">
              <span className="text-gray-400 whitespace-nowrap">/learn/</span>
              <input
                id="article-slug"
                value={slug}
                disabled={busy}
                onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); touch() }}
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-brand-400"
              />
            </div>
            {slugWarning && (
              <p className="text-xs text-amber-700 mt-1">
                This article is live. Changing its web address will break any link
                already shared to it.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="article-tags" className="block text-sm font-medium text-gray-800 mb-1">
              Tags <span className="font-normal text-gray-400">(optional, comma separated)</span>
            </label>
            <input
              id="article-tags"
              value={tagsText}
              disabled={busy}
              onChange={(e) => { setTagsText(e.target.value); touch() }}
              placeholder="hot_flashes, sleep"
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-brand-400"
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-800">The article</label>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">
              about {estimateReadMinutes(bodyMd)} min to read
            </span>
            <button
              type="button"
              onClick={() => setPreview((p) => !p)}
              className="text-xs flex items-center gap-1 text-brand-700 hover:text-brand-900"
            >
              {preview ? <Pencil className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {preview ? 'Back to writing' : 'Preview as a reader'}
            </button>
          </div>
        </div>

        {preview ? (
          // Rendered exactly as /learn/[slug] renders it — same component,
          // same plugins — so the preview cannot flatter the real page.
          <div className="border border-gray-200 rounded-xl bg-white px-4 py-3">
            <div className="prose prose-sm max-w-none prose-headings:text-brand-900 prose-a:text-brand-600">
              {bodyMd.trim()
                ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{bodyMd}</ReactMarkdown>
                : <p className="text-gray-400">Nothing written yet.</p>}
            </div>
          </div>
        ) : (
          <RichTextEditor
            initialMarkdown={article?.body_md ?? ''}
            onChange={(md) => { setBodyMd(md); touch() }}
            disabled={busy}
          />
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || !dirty}
          className="text-sm bg-white border border-gray-300 text-gray-800 px-4 py-2 rounded-xl hover:border-brand-400 disabled:opacity-40"
        >
          {saving === 'saving' ? 'Saving…' : dirty ? 'Save' : 'Saved'}
        </button>

        {state === 'draft' ? (
          <button
            type="button"
            onClick={() => void changePublication('publish')}
            disabled={busy || !readiness.ready}
            title={readiness.ready ? undefined : readiness.problems.join(' ')}
            className="text-sm bg-brand-900 text-white px-4 py-2 rounded-xl hover:bg-brand-800 disabled:opacity-40"
          >
            {saving === 'publishing' ? 'Publishing…' : 'Publish'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void changePublication('unpublish')}
            disabled={busy}
            className="text-sm bg-white border border-amber-300 text-amber-800 px-4 py-2 rounded-xl hover:bg-amber-50"
          >
            {saving === 'publishing' ? 'Working…' : 'Unpublish'}
          </button>
        )}

        {!readiness.ready && state === 'draft' && (
          <p className="text-xs text-gray-500">
            {readiness.problems.join(' ')}
          </p>
        )}

        <div className="flex-1" />

        {state === 'live' && (
          <a
            href={`/learn/${slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-brand-700 hover:text-brand-900 flex items-center gap-1"
          >
            <ExternalLink className="w-3.5 h-3.5" /> View in the app
          </a>
        )}

        {id && state === 'draft' && (
          <button
            type="button"
            onClick={() => void remove()}
            disabled={busy}
            className="text-xs text-red-600 hover:text-red-800 flex items-center gap-1 disabled:opacity-40"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {saving === 'deleting' ? 'Deleting…' : 'Delete draft'}
          </button>
        )}
      </div>

      {revisions.length > 0 && <History revisions={revisions} />}
    </div>
  )
}

function StatusBanner({
  state,
  publishedAt,
  slug,
}: {
  state: PublicationState
  publishedAt: string | null
  slug: string
}) {
  const styles: Record<PublicationState, string> = {
    draft: 'bg-gray-50 border-gray-200 text-gray-700',
    scheduled: 'bg-amber-50 border-amber-200 text-amber-800',
    live: 'bg-green-50 border-green-200 text-green-800',
  }

  const message: Record<PublicationState, string> = {
    draft: 'Draft — only you can see this. Nothing is in the app until you publish it.',
    scheduled: `Scheduled — this goes live on its own at ${
      publishedAt ? new Date(publishedAt).toLocaleString('en-GB') : 'the date set'
    }.`,
    live: 'Live — women using the app can read this now. Any change you save appears straight away.',
  }

  return (
    <div className={`border rounded-xl px-4 py-3 text-sm ${styles[state]}`}>
      {message[state]}
      {state === 'live' && slug && (
        <span className="block text-xs mt-0.5 opacity-80">/learn/{slug}</span>
      )}
    </div>
  )
}

function History({ revisions }: { revisions: ArticleRevisionEntry[] }) {
  const verb: Record<string, string> = {
    created: 'created',
    edited: 'edited',
    published: 'published',
    unpublished: 'unpublished',
    deleted: 'deleted',
  }

  return (
    <details className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <summary className="text-sm font-medium text-gray-800 cursor-pointer">
        History ({revisions.length})
      </summary>
      <ul className="mt-3 space-y-1.5">
        {revisions.map((r) => (
          <li key={r.id} className="text-xs text-gray-600 flex items-baseline gap-2">
            <span className="text-gray-400 whitespace-nowrap">
              {new Date(r.created_at).toLocaleString('en-GB')}
            </span>
            <span>
              {verb[r.action] ?? r.action}
              {r.actor_email ? ` by ${r.actor_email}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </details>
  )
}
