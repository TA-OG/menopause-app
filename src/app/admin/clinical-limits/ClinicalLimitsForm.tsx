'use client'

import { useState } from 'react'
import {
  LIMIT_QUESTIONS,
  REQUIRED_LIMIT_QUESTION_IDS,
  type LimitTopic,
} from '@/lib/clinical-limits-config'

interface Props {
  topics: LimitTopic[]
  savedAnswers: Record<string, Record<string, string>>
  verifiedCount: number
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

function isComplete(answers: Record<string, string> | undefined): boolean {
  if (!answers) return false
  return REQUIRED_LIMIT_QUESTION_IDS.every((id) => (answers[id] ?? '').trim() !== '')
}

export default function ClinicalLimitsForm({ topics, savedAnswers, verifiedCount }: Props) {
  const [answers, setAnswers] = useState<Record<string, Record<string, string>>>(savedAnswers)
  const [openId, setOpenId] = useState<string | null>(topics[0]?.id ?? null)
  const [saveState, setSaveState] = useState<Record<string, SaveState>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  const doneCount = topics.filter((t) => isComplete(answers[t.id])).length

  function setAnswer(topicId: string, questionId: string, value: string) {
    setAnswers((prev) => ({
      ...prev,
      [topicId]: { ...(prev[topicId] ?? {}), [questionId]: value },
    }))
    setSaveState((prev) => ({ ...prev, [topicId]: 'idle' }))
  }

  async function save(topic: LimitTopic) {
    setSaveState((prev) => ({ ...prev, [topic.id]: 'saving' }))
    setErrors((prev) => ({ ...prev, [topic.id]: '' }))
    try {
      const res = await fetch('/api/admin/clinical-limits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          substanceKey: topic.id,
          substanceLabel: topic.label,
          answers: answers[topic.id] ?? {},
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Could not save')
      setSaveState((prev) => ({ ...prev, [topic.id]: 'saved' }))
    } catch (err) {
      setSaveState((prev) => ({ ...prev, [topic.id]: 'error' }))
      setErrors((prev) => ({
        ...prev,
        [topic.id]: err instanceof Error ? err.message : 'Could not save',
      }))
    }
  }

  return (
    <div className="space-y-6 py-4 max-w-3xl">
      <header className="space-y-3">
        <h1 className="text-2xl font-bold text-gray-900">Safe daily limits</h1>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900 space-y-2">
          <p>
            The app already makes sure a woman can never be shown the same supplement twice
            over, so the doses can&apos;t add up on her without anyone noticing. What it
            can&apos;t do yet is tell her the most she should take of each one in a day.
          </p>
          <p>
            That number has to come from a person who can stand behind it, which is what
            this page is for. <strong>Nothing you write here changes the app.</strong> It is
            recorded for review, and someone on the team enters it properly afterwards.
          </p>
          <p>
            If you don&apos;t know a figure, please leave it blank rather than estimating.
            A blank is safe — a guess is not.
          </p>
        </div>
        <p className="text-sm text-gray-500">
          {doneCount} of {topics.length} answered
          {verifiedCount > 0 && ` · ${verifiedCount} already signed off and live`}
        </p>
      </header>

      {topics.length === 0 && (
        <p className="text-sm text-gray-600">
          Every substance has a signed-off limit. Nothing to answer here.
        </p>
      )}

      <div className="space-y-3">
        {topics.map((topic) => {
          const open = openId === topic.id
          const complete = isComplete(answers[topic.id])
          const state = saveState[topic.id] ?? 'idle'

          return (
            <section key={topic.id} className="border border-gray-200 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenId(open ? null : topic.id)}
                className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-gray-50"
                aria-expanded={open}
              >
                <span className="font-semibold text-gray-900">{topic.label}</span>
                <span
                  className={`text-xs px-2 py-1 rounded-full ${
                    complete ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {complete ? 'Answered' : 'Not answered'}
                </span>
              </button>

              {open && (
                <div className="p-4 pt-0 space-y-4">
                  {topic.note && (
                    <p className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
                      <strong>Note from the team:</strong> {topic.note}
                    </p>
                  )}

                  {topic.currentCopy.length > 0 && (
                    <details className="text-sm">
                      <summary className="cursor-pointer text-gray-700 font-medium">
                        What the app currently tells women about this
                        {topic.currentCopy.length > 1 && ` (${topic.currentCopy.length} versions)`}
                      </summary>
                      <div className="mt-2 space-y-2">
                        {topic.currentCopy.map((rec) => (
                          <div key={rec.id} className="bg-gray-50 rounded-lg p-3">
                            <p className="font-medium text-gray-900 text-xs mb-1">{rec.title}</p>
                            <p className="text-xs text-gray-600 leading-relaxed">{rec.body}</p>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}

                  {LIMIT_QUESTIONS.map((q) => (
                    <div key={q.id}>
                      <label
                        htmlFor={`${topic.id}-${q.id}`}
                        className="block text-sm font-medium text-gray-900"
                      >
                        {q.prompt}
                        {!q.optional && <span className="text-red-500"> *</span>}
                      </label>
                      {q.helper && <p className="text-xs text-gray-500 mt-0.5">{q.helper}</p>}
                      <textarea
                        id={`${topic.id}-${q.id}`}
                        value={answers[topic.id]?.[q.id] ?? ''}
                        onChange={(e) => setAnswer(topic.id, q.id, e.target.value)}
                        rows={q.kind === 'long' ? 4 : 2}
                        className="mt-1.5 w-full rounded-lg border border-gray-300 p-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                      />
                    </div>
                  ))}

                  {errors[topic.id] && (
                    <p className="text-sm text-red-600">{errors[topic.id]}</p>
                  )}

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => save(topic)}
                      disabled={state === 'saving'}
                      className="bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-700 disabled:opacity-50"
                    >
                      {state === 'saving' ? 'Saving…' : 'Save'}
                    </button>
                    {state === 'saved' && (
                      <span className="text-sm text-green-700">Saved</span>
                    )}
                  </div>
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
