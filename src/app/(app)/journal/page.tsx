'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { JournalEntry, SymptomKey } from '@/types/database'

const SYMPTOM_LABELS: Record<SymptomKey, string> = {
  hot_flashes: 'Hot flushes',
  night_sweats: 'Night sweats',
  sleep_problems: 'Sleep problems',
  mood_changes: 'Mood changes',
  anxiety: 'Anxiety',
  brain_fog: 'Brain fog',
  weight_changes: 'Weight changes',
  joint_pain: 'Joint pain',
  low_libido: 'Low libido',
  fatigue: 'Fatigue',
  vaginal_dryness: 'Vaginal dryness',
  skin_changes: 'Skin changes',
  hair_changes: 'Hair changes',
  other: 'Other',
}

const EFFECT_LABELS = {
  much_better: '✅ Much better',
  better: '👍 Better',
  no_change: '➡️ No change',
  worse: '👎 Worse',
}

export default function JournalPage() {
  const supabase = createClient()
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)

  // New entry form state
  const [content, setContent] = useState('')
  const [symptomFocus, setSymptomFocus] = useState<SymptomKey | ''>('')
  const [planItemTitle, setPlanItemTitle] = useState('')
  const [daysTried, setDaysTried] = useState<number | ''>('')
  const [perceivedEffect, setPerceivedEffect] = useState('')
  const [wouldContinue, setWouldContinue] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadEntries()
  }, [])

  async function loadEntries() {
    const { data } = await supabase
      .from('journal_entries')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)
    setEntries(data ?? [])
    setLoading(false)
  }

  async function saveEntry() {
    if (!content.trim()) return
    setSaving(true)

    const { error } = await supabase.from('journal_entries').insert({
      content: content.trim(),
      symptom_focus: symptomFocus || null,
      plan_item_title: planItemTitle || null,
      days_tried: daysTried !== '' ? Number(daysTried) : null,
      perceived_effect: perceivedEffect || null,
      would_continue: wouldContinue,
    })

    if (!error) {
      setContent('')
      setSymptomFocus('')
      setPlanItemTitle('')
      setDaysTried('')
      setPerceivedEffect('')
      setWouldContinue(null)
      setShowNew(false)
      loadEntries()
    }
    setSaving(false)
  }

  return (
    <div className="space-y-6 py-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-900">Journal</h1>
        <button
          onClick={() => setShowNew(!showNew)}
          className="bg-brand-900 text-white text-sm font-semibold px-4 py-2 rounded-xl"
        >
          + New entry
        </button>
      </div>

      {/* New entry form */}
      {showNew && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
          <h2 className="font-semibold text-gray-900">New journal entry</h2>

          {/* Symptom focus */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">
              Which symptom are you tracking? (optional)
            </label>
            <select
              value={symptomFocus}
              onChange={(e) => setSymptomFocus(e.target.value as SymptomKey)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
            >
              <option value="">No specific symptom</option>
              {Object.entries(SYMPTOM_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          {/* Plan item being tracked */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">
              Which adjustment are you trialling? (optional)
            </label>
            <input
              type="text"
              value={planItemTitle}
              onChange={(e) => setPlanItemTitle(e.target.value)}
              placeholder="e.g. Reducing caffeine, Daily paced breathing..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
            />
          </div>

          {/* Days tried */}
          {planItemTitle && (
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">
                How many days have you been trying this?
              </label>
              <input
                type="number"
                min={1}
                value={daysTried}
                onChange={(e) => setDaysTried(Number(e.target.value))}
                className="w-32 border border-gray-200 rounded-xl px-3 py-2 text-sm"
              />
            </div>
          )}

          {/* Perceived effect */}
          {planItemTitle && (
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">
                How has it been going?
              </label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(EFFECT_LABELS).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setPerceivedEffect(key)}
                    className={`text-sm px-3 py-2 rounded-xl border transition-colors ${
                      perceivedEffect === key
                        ? 'bg-brand-900 text-white border-brand-900'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-brand-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Would continue */}
          {perceivedEffect && (
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">
                Would you continue with this?
              </label>
              <div className="flex gap-2">
                {[
                  { value: true, label: 'Yes' },
                  { value: false, label: 'No' },
                ].map(({ value, label }) => (
                  <button
                    key={label}
                    onClick={() => setWouldContinue(value)}
                    className={`text-sm px-4 py-2 rounded-xl border transition-colors ${
                      wouldContinue === value
                        ? 'bg-brand-900 text-white border-brand-900'
                        : 'bg-white text-gray-700 border-gray-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Free text notes */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">
              Your notes
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="How are you feeling? What have you noticed? What worked, what didn't?"
              rows={4}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={saveEntry}
              disabled={!content.trim() || saving}
              className="flex-1 bg-brand-900 text-white font-semibold py-2 rounded-xl disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save entry'}
            </button>
            <button
              onClick={() => setShowNew(false)}
              className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Entry list */}
      {loading ? (
        <p className="text-gray-400 text-sm text-center py-8">Loading...</p>
      ) : entries.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400 text-sm">No journal entries yet.</p>
          <p className="text-gray-400 text-sm mt-1">
            Use the journal to track what you&apos;re trying and how it&apos;s going.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-400">
                  {new Date(entry.created_at).toLocaleDateString('en-GB', {
                    day: 'numeric', month: 'short', year: 'numeric'
                  })}
                </span>
                {entry.symptom_focus && (
                  <span className="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">
                    {SYMPTOM_LABELS[entry.symptom_focus]}
                  </span>
                )}
              </div>

              {entry.plan_item_title && (
                <p className="text-sm font-medium text-gray-700 mb-1">
                  🎯 {entry.plan_item_title}
                  {entry.days_tried && (
                    <span className="text-gray-400 font-normal">
                      {' '}· Day {entry.days_tried}
                    </span>
                  )}
                </p>
              )}

              {entry.perceived_effect && (
                <p className="text-sm text-gray-600 mb-1">
                  {EFFECT_LABELS[entry.perceived_effect as keyof typeof EFFECT_LABELS]}
                  {entry.would_continue !== null && (
                    <span className="ml-2 text-gray-400">
                      · {entry.would_continue ? 'Would continue' : 'Would not continue'}
                    </span>
                  )}
                </p>
              )}

              {entry.content && (
                <p className="text-sm text-gray-600 mt-2 leading-relaxed">
                  {entry.content}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
