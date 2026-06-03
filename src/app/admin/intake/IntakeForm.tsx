'use client'

import { useMemo, useState } from 'react'
import {
  TOPICS,
  QUESTIONS,
  REQUIRED_QUESTION_IDS,
  type IntakeTopic,
} from '@/lib/content-intake-config'
import type { SavedTopic } from './page'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export default function IntakeForm({
  saved,
  customTopics,
}: {
  saved: SavedTopic[]
  customTopics: IntakeTopic[]
}) {
  // Combined topic list: predefined config topics + any custom ones already saved.
  const [topics, setTopics] = useState<IntakeTopic[]>(() => {
    const known = new Set(TOPICS.map((t) => t.id))
    return [...TOPICS, ...customTopics.filter((t) => !known.has(t.id))]
  })

  // answers[topicId][questionId] = text
  const [answers, setAnswers] = useState<Record<string, Record<string, string>>>(() => {
    const init: Record<string, Record<string, string>> = {}
    for (const t of saved) init[t.topicId] = { ...t.answers }
    return init
  })

  const [activeId, setActiveId] = useState<string>(topics[0]?.id ?? '')
  const [dirty, setDirty] = useState<Record<string, boolean>>({})
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [errorMsg, setErrorMsg] = useState<string>('')

  // Add-your-own-topic UI
  const [addingTopic, setAddingTopic] = useState(false)
  const [newTopicName, setNewTopicName] = useState('')

  const activeTopic = topics.find((t) => t.id === activeId)
  const activeAnswers = answers[activeId] ?? {}

  const completion = useMemo(() => {
    const map: Record<string, 'empty' | 'partial' | 'complete'> = {}
    for (const t of topics) {
      const a = answers[t.id] ?? {}
      const filled = REQUIRED_QUESTION_IDS.filter((q) => (a[q] ?? '').trim().length > 0)
      map[t.id] =
        filled.length === 0
          ? 'empty'
          : filled.length === REQUIRED_QUESTION_IDS.length
            ? 'complete'
            : 'partial'
    }
    return map
  }, [topics, answers])

  function setAnswer(questionId: string, value: string) {
    setAnswers((prev) => ({
      ...prev,
      [activeId]: { ...(prev[activeId] ?? {}), [questionId]: value },
    }))
    setDirty((prev) => ({ ...prev, [activeId]: true }))
    if (saveState !== 'idle') setSaveState('idle')
  }

  function selectTopic(id: string) {
    setActiveId(id)
    setSaveState('idle')
    setErrorMsg('')
  }

  function addTopic() {
    const label = newTopicName.trim()
    if (!label) return
    let id = slugify(label)
    if (!id) return
    // Avoid colliding with an existing topic id.
    const existing = new Set(topics.map((t) => t.id))
    if (existing.has(id)) {
      let n = 2
      while (existing.has(`${id}_${n}`)) n++
      id = `${id}_${n}`
    }
    setTopics((prev) => [...prev, { id, label }])
    setNewTopicName('')
    setAddingTopic(false)
    selectTopic(id)
  }

  async function save() {
    if (!activeTopic) return
    setSaveState('saving')
    setErrorMsg('')
    try {
      const res = await fetch('/api/admin/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicId: activeTopic.id,
          topicLabel: activeTopic.label,
          answers: activeAnswers,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `Save failed (${res.status})`)
      }
      setDirty((prev) => ({ ...prev, [activeId]: false }))
      setSaveState('saved')
    } catch (err) {
      setErrorMsg((err as Error).message)
      setSaveState('error')
    }
  }

  const statusDot = (state: 'empty' | 'partial' | 'complete') =>
    state === 'complete'
      ? 'bg-green-500'
      : state === 'partial'
        ? 'bg-yellow-400'
        : 'bg-gray-300'

  return (
    <div className="space-y-6">
      {/* Intro */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="text-lg font-bold text-brand-900">Content intake</h2>
        <p className="text-sm text-gray-600 mt-1 leading-relaxed">
          Work through one topic at a time. For each one, answer in your own words —
          full sentences, as much detail as you like. Your answers are saved privately
          and turned into the app&apos;s advice later. Nothing here is shown to users until
          it&apos;s reviewed. You can come back and edit any topic any time.
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Topic list */}
        <aside className="md:w-64 flex-shrink-0">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <p className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-100">
              Topics
            </p>
            <ul className="max-h-[28rem] overflow-y-auto">
              {topics.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => selectTopic(t.id)}
                    className={`w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors ${
                      t.id === activeId
                        ? 'bg-brand-50 text-brand-900 font-medium'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot(completion[t.id])}`}
                      aria-hidden
                    />
                    <span className="flex-1">{t.label}</span>
                    {dirty[t.id] && <span className="w-1.5 h-1.5 rounded-full bg-brand-400" title="Unsaved changes" />}
                  </button>
                </li>
              ))}
            </ul>

            {/* Add your own topic */}
            <div className="border-t border-gray-100 p-3">
              {addingTopic ? (
                <div className="space-y-2">
                  <input
                    autoFocus
                    value={newTopicName}
                    onChange={(e) => setNewTopicName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addTopic()}
                    placeholder="New topic name"
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-300"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={addTopic}
                      className="flex-1 text-xs bg-brand-900 text-white px-3 py-1.5 rounded-lg hover:bg-brand-800 transition-colors"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => {
                        setAddingTopic(false)
                        setNewTopicName('')
                      }}
                      className="text-xs text-gray-500 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAddingTopic(true)}
                  className="w-full text-sm text-brand-700 hover:text-brand-900 hover:bg-brand-50 rounded-lg px-3 py-2 text-left transition-colors"
                >
                  + Add your own topic
                </button>
              )}
            </div>
          </div>
        </aside>

        {/* Active topic form */}
        <section className="flex-1 min-w-0">
          {!activeTopic ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-gray-400 text-sm">
              Pick a topic to begin.
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6 space-y-6">
              <div>
                <h3 className="text-xl font-bold text-brand-900">{activeTopic.label}</h3>
                {activeTopic.blurb && (
                  <p className="text-sm text-gray-500 mt-1">{activeTopic.blurb}</p>
                )}
              </div>

              {QUESTIONS.map((q, i) => (
                <div key={q.id}>
                  <label htmlFor={q.id} className="block">
                    <span className="text-sm font-semibold text-gray-900">
                      {i + 1}. {q.prompt}
                      {q.optional && (
                        <span className="ml-2 text-xs font-normal text-gray-400">(optional)</span>
                      )}
                    </span>
                    {q.helper && (
                      <span className="block text-xs text-gray-500 mt-0.5">{q.helper}</span>
                    )}
                  </label>
                  <textarea
                    id={q.id}
                    value={activeAnswers[q.id] ?? ''}
                    onChange={(e) => setAnswer(q.id, e.target.value)}
                    rows={q.kind === 'long' ? 5 : 2}
                    className="mt-2 w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand-300 resize-y"
                    placeholder="Type your answer here…"
                  />
                </div>
              ))}

              {/* Save bar */}
              <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
                <button
                  onClick={save}
                  disabled={saveState === 'saving'}
                  className="bg-brand-900 text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-brand-800 transition-colors disabled:opacity-50"
                >
                  {saveState === 'saving' ? 'Saving…' : 'Save this topic'}
                </button>
                {saveState === 'saved' && (
                  <span className="text-sm text-green-600">Saved ✓</span>
                )}
                {saveState === 'error' && (
                  <span className="text-sm text-red-600">{errorMsg || 'Save failed'}</span>
                )}
                {saveState === 'idle' && dirty[activeId] && (
                  <span className="text-sm text-gray-400">Unsaved changes</span>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
