'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  REVIEW_STATUS_LABELS,
  REVIEW_STATUS_DESCRIPTIONS,
  isLive,
  type ReviewAction,
  type ReviewStatus,
} from '@/lib/article-review'

export interface ReviewArticle {
  id: string
  slug: string
  title: string
  body_md: string
  tier: 'free' | 'premium'
  category: string
  tags: string[]
  estimated_read_minutes: number | null
  published_at: string | null
  review_status: ReviewStatus
  reviewed_at: string | null
  review_note: string | null
  updated_at: string
}

export interface ReviewHistoryEntry {
  id: string
  module_id: string
  from_status: ReviewStatus | null
  to_status: ReviewStatus
  note: string | null
  actor_email: string | null
  created_at: string
}

interface Props {
  articles: ReviewArticle[]
  history: Record<string, ReviewHistoryEntry[]>
  counts: { waiting: number; sentBack: number; approved: number; drafts: number }
}

type SaveState = 'idle' | 'saving' | 'error'

const STATUS_STYLES: Record<ReviewStatus, string> = {
  in_review:         'bg-amber-100 text-amber-900',
  changes_requested: 'bg-blush-100 text-blush-800',
  approved:          'bg-green-100 text-green-800',
  draft:             'bg-gray-100 text-gray-600',
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

export default function ArticleReview({ articles, history, counts }: Props) {
  const router = useRouter()
  const [openId, setOpenId] = useState<string | null>(articles[0]?.id ?? null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [saveState, setSaveState] = useState<Record<string, SaveState>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  async function decide(article: ReviewArticle, action: ReviewAction) {
    const note = (notes[article.id] ?? '').trim()

    if (action === 'request_changes' && note === '') {
      setErrors((prev) => ({
        ...prev,
        [article.id]: 'Please write what needs changing, so whoever rewrites it knows what you meant.',
      }))
      return
    }

    setSaveState((prev) => ({ ...prev, [article.id]: 'saving' }))
    setErrors((prev) => ({ ...prev, [article.id]: '' }))

    try {
      const res = await fetch(`/api/admin/articles/${article.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, note: note === '' ? null : note }),
      })
      // A proxy or gateway error returns HTML, not JSON — parsing first would
      // surface "Unexpected token '<'" instead of a failed decision.
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? `Could not save (${res.status})`)

      setSaveState((prev) => ({ ...prev, [article.id]: 'idle' }))
      setNotes((prev) => ({ ...prev, [article.id]: '' }))
      router.refresh()
    } catch (err) {
      setSaveState((prev) => ({ ...prev, [article.id]: 'error' }))
      setErrors((prev) => ({
        ...prev,
        [article.id]: err instanceof Error ? err.message : 'Could not save',
      }))
    }
  }

  return (
    <div className="space-y-6 py-4 max-w-3xl">
      <header className="space-y-3">
        <h1 className="text-2xl font-bold text-gray-900">Articles</h1>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900 space-y-2">
          <p>
            Nothing written for the Learn section reaches a single woman until you have read
            it here and approved it. Until then it stays hidden, however finished it looks.
          </p>
          <p>
            Approving is you saying <strong>these exact words are right</strong>. If anyone
            changes the title or the wording afterwards, your approval comes off automatically
            and the article hides itself again until you have read the new version.
          </p>
          <p>
            If something is wrong, send it back and say what it is. A dose that isn&apos;t in
            your source, a claim stronger than the evidence, anything that reads like an
            instruction rather than a suggestion — those are exactly what this page is for.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Waiting for you', value: counts.waiting },
            { label: 'Sent back',       value: counts.sentBack },
            { label: 'Approved',        value: counts.approved },
            { label: 'Being written',   value: counts.drafts },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 text-center"
            >
              <p className="text-2xl font-bold text-brand-900">{stat.value}</p>
              <p className="text-xs text-gray-500 mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      </header>

      {articles.length === 0 && (
        <p className="text-sm text-gray-600 bg-white border border-gray-100 rounded-xl p-6 text-center">
          There are no articles yet. When the team writes one, it will appear here for you
          before anyone else can see it.
        </p>
      )}

      <div className="space-y-3">
        {articles.map((article) => {
          const open = openId === article.id
          const live = isLive(article)
          const state = saveState[article.id] ?? 'idle'
          const entries = history[article.id] ?? []
          const busy = state === 'saving'

          return (
            <section
              key={article.id}
              className="border border-gray-200 rounded-xl overflow-hidden bg-white"
            >
              <button
                type="button"
                onClick={() => setOpenId(open ? null : article.id)}
                className="w-full flex items-start justify-between gap-3 p-4 text-left hover:bg-gray-50"
                aria-expanded={open}
              >
                <span className="flex-1">
                  <span className="block font-semibold text-gray-900">{article.title}</span>
                  <span className="block text-xs text-gray-500 mt-0.5">
                    {article.category}
                    {' · '}
                    {article.tier === 'premium' ? 'Premium' : 'Free'}
                    {article.estimated_read_minutes
                      ? ` · ${article.estimated_read_minutes} min read`
                      : ''}
                  </span>
                </span>
                <span className="flex items-center gap-2 flex-shrink-0">
                  {live && (
                    <span className="text-xs px-2 py-1 rounded-full bg-green-600 text-white">
                      Live
                    </span>
                  )}
                  <span
                    className={`text-xs px-2 py-1 rounded-full ${STATUS_STYLES[article.review_status]}`}
                  >
                    {REVIEW_STATUS_LABELS[article.review_status]}
                  </span>
                </span>
              </button>

              {open && (
                <div className="p-4 pt-0 space-y-4">
                  <p className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3">
                    {REVIEW_STATUS_DESCRIPTIONS[article.review_status]}
                    {article.review_status === 'approved' && !live && article.published_at && (
                      <>
                        {' '}
                        It is not showing in the app yet — it is dated to go out on{' '}
                        {formatDate(article.published_at)}.
                      </>
                    )}
                  </p>

                  {article.review_note && (
                    <div className="bg-blush-50 border border-blush-200 rounded-lg p-3">
                      <p className="text-xs font-medium text-blush-800">
                        Your last note{article.reviewed_at ? ` (${formatDate(article.reviewed_at)})` : ''}
                      </p>
                      <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">
                        {article.review_note}
                      </p>
                    </div>
                  )}

                  {/* The article exactly as a woman using the app would read it. */}
                  <div className="border border-gray-200 rounded-xl p-4">
                    <p className="text-xs text-gray-400 uppercase tracking-wider mb-3">
                      What she would read
                    </p>
                    <h2 className="text-xl font-bold text-brand-900 leading-snug mb-3">
                      {article.title}
                    </h2>
                    <div className="prose prose-sm max-w-none prose-headings:text-brand-900 prose-a:text-brand-600">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {article.body_md}
                      </ReactMarkdown>
                    </div>
                  </div>

                  {/* Decision */}
                  <div className="space-y-3">
                    <label
                      htmlFor={`note-${article.id}`}
                      className="block text-sm font-medium text-gray-900"
                    >
                      Your note
                      <span className="block text-xs font-normal text-gray-500 mt-0.5">
                        Needed if you are sending it back. Optional if you are approving.
                      </span>
                    </label>
                    <textarea
                      id={`note-${article.id}`}
                      value={notes[article.id] ?? ''}
                      onChange={(e) => {
                        const value = e.target.value
                        setNotes((prev) => ({ ...prev, [article.id]: value }))
                        setErrors((prev) => ({ ...prev, [article.id]: '' }))
                      }}
                      rows={3}
                      placeholder="What needs changing, and why."
                      className="w-full rounded-lg border border-gray-300 p-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                    />

                    {errors[article.id] && (
                      <p className="text-sm text-red-600">{errors[article.id]}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-3">
                      {article.review_status !== 'approved' && article.review_status !== 'draft' && (
                        <button
                          type="button"
                          onClick={() => decide(article, 'approve')}
                          disabled={busy}
                          className="bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-green-800 disabled:opacity-50"
                        >
                          {busy ? 'Saving…' : 'Approve — put this in front of women'}
                        </button>
                      )}

                      {article.review_status !== 'draft' && (
                        <button
                          type="button"
                          onClick={() => decide(article, 'request_changes')}
                          disabled={busy}
                          className="border border-gray-300 text-gray-800 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                        >
                          {article.review_status === 'approved'
                            ? 'Take this down and send it back'
                            : 'Send back for changes'}
                        </button>
                      )}

                      {article.review_status === 'draft' && (
                        <p className="text-sm text-gray-500">
                          Still being written. It will come to you when the team marks it ready.
                        </p>
                      )}
                    </div>
                  </div>

                  {entries.length > 0 && (
                    <details className="text-sm">
                      <summary className="cursor-pointer text-gray-700 font-medium">
                        Everything that has happened to this article ({entries.length})
                      </summary>
                      <ul className="mt-2 space-y-2">
                        {entries.map((entry) => (
                          <li key={entry.id} className="bg-gray-50 rounded-lg p-3">
                            <p className="text-xs text-gray-500">
                              {formatDate(entry.created_at)}
                              {entry.actor_email ? ` · ${entry.actor_email}` : ''}
                            </p>
                            <p className="text-xs font-medium text-gray-900 mt-0.5">
                              {REVIEW_STATUS_LABELS[entry.to_status]}
                            </p>
                            {entry.note && (
                              <p className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">
                                {entry.note}
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
