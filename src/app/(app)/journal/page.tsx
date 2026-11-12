'use client'

import { Target } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { JournalEntry, SymptomKey } from '@/types/database'

// Symptom labels come from the shared Symptoms messages; effect labels from
// Journal.effects. Keys are the stored values — never translate those.
const SYMPTOM_KEYS: SymptomKey[] = [
  'hot_flashes', 'night_sweats', 'sleep_problems', 'mood_changes', 'anxiety',
  'brain_fog', 'weight_changes', 'joint_pain', 'low_libido', 'fatigue',
  'vaginal_dryness', 'skin_changes', 'hair_changes', 'other',
]

const EFFECT_KEYS = ['much_better', 'better', 'no_change', 'worse'] as const
type EffectKey = (typeof EFFECT_KEYS)[number]

export default function JournalPage() {
  const t = useTranslations('Journal')
  const symptomLabel = useTranslations('Symptoms')
  const locale = useLocale()
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [isLimited, setIsLimited] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [saveError, setSaveError] = useState('')

  // New entry form state
  const [content, setContent] = useState('')
  const [symptomFocus, setSymptomFocus] = useState<SymptomKey | ''>('')
  const [planItemTitle, setPlanItemTitle] = useState('')
  const [daysTried, setDaysTried] = useState<number | ''>('')
  const [perceivedEffect, setPerceivedEffect] = useState('')
  const [wouldContinue, setWouldContinue] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)

  // Load via API — enforces free-tier 7-day restriction server-side
  const loadEntries = useCallback(async () => {
    try {
      const res = await fetch('/api/journal?limit=50')
      if (res.ok) {
        const { data, limited } = await res.json()
        setEntries(data ?? [])
        setIsLimited(!!limited)
        setLoadError(false)
      } else {
        // Say so: an empty list here would read as "you have no entries".
        setLoadError(true)
      }
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadEntries()
  }, [loadEntries])

  async function saveEntry() {
    if (!content.trim()) return
    setSaving(true)
    setSaveError('')

    try {
      const res = await fetch('/api/journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: content.trim(),
          symptom_focus: symptomFocus || null,
          plan_item_title: planItemTitle || null,
          days_tried: daysTried !== '' ? Number(daysTried) : null,
          perceived_effect: perceivedEffect || null,
          would_continue: wouldContinue,
        }),
      })

      if (!res.ok) {
        // The API's message is English: log it, show hers.
        const { error } = await res.json().catch(() => ({ error: undefined }))
        console.error('journal save failed:', res.status, error)
        setSaveError(t('errorSave'))
        return
      }

      setContent('')
      setSymptomFocus('')
      setPlanItemTitle('')
      setDaysTried('')
      setPerceivedEffect('')
      setWouldContinue(null)
      setShowNew(false)
      loadEntries()
    } catch {
      setSaveError(t('errorNetwork'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 py-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-900">{t('title')}</h1>
        <button
          onClick={() => setShowNew(!showNew)}
          className="bg-brand-900 text-white text-sm font-semibold px-4 py-2 rounded-xl"
        >
          {t('newEntry')}
        </button>
      </div>

      {/* New entry form */}
      {showNew && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
          <h2 className="font-semibold text-gray-900">{t('newEntryTitle')}</h2>

          {/* Symptom focus */}
          <div>
            <label htmlFor="jr-field-1" className="text-sm font-medium text-gray-700 block mb-1">
              {t('symptomLabel')}
            </label>
            <select id="jr-field-1"
              value={symptomFocus}
              onChange={(e) => setSymptomFocus(e.target.value as SymptomKey)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
            >
              <option value="">{t('noSymptom')}</option>
              {SYMPTOM_KEYS.map((key) => (
                <option key={key} value={key}>{symptomLabel(key)}</option>
              ))}
            </select>
          </div>

          {/* Plan item being tracked */}
          <div>
            <label htmlFor="jr-field-2" className="text-sm font-medium text-gray-700 block mb-1">
              {t('planItemLabel')}
            </label>
            <input id="jr-field-2"
              type="text"
              value={planItemTitle}
              onChange={(e) => setPlanItemTitle(e.target.value)}
              placeholder={t('planItemPlaceholder')}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
            />
          </div>

          {/* Days tried */}
          {planItemTitle && (
            <div>
              <label htmlFor="jr-field-3" className="text-sm font-medium text-gray-700 block mb-1">
                {t('daysLabel')}
              </label>
              <input id="jr-field-3"
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
                {t('effectLabel')}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {EFFECT_KEYS.map((key) => (
                  <button
                    key={key}
                    onClick={() => setPerceivedEffect(key)}
                    className={`text-sm px-3 py-2 rounded-xl border transition-colors ${
                      perceivedEffect === key
                        ? 'bg-brand-900 text-white border-brand-900'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-brand-300'
                    }`}
                  >
                    {t(`effects.${key}`)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Would continue */}
          {perceivedEffect && (
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">
                {t('continueLabel')}
              </label>
              <div className="flex gap-2">
                {[
                  { value: true, label: t('yes') },
                  { value: false, label: t('no') },
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
            <label htmlFor="jr-field-4" className="text-sm font-medium text-gray-700 block mb-1">
              {t('notesLabel')}
            </label>
            <textarea id="jr-field-4"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t('notesPlaceholder')}
              rows={4}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none"
            />
          </div>

          {saveError && (
            <p className="text-red-600 text-sm bg-red-50 rounded-xl px-3 py-2">{saveError}</p>
          )}

          <div className="flex gap-2">
            <button
              onClick={saveEntry}
              disabled={!content.trim() || saving}
              className="flex-1 bg-brand-900 text-white font-semibold py-2 rounded-xl disabled:opacity-50"
            >
              {saving ? t('saving') : t('save')}
            </button>
            <button
              onClick={() => setShowNew(false)}
              className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600"
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Free-tier restriction notice */}
      {isLimited && (
        <div className="bg-brand-50 border border-brand-200 rounded-2xl p-4">
          <p className="text-sm font-semibold text-brand-900">{t('limitedTitle')}</p>
          <p className="text-sm text-brand-700 mt-1 mb-3">
            {t('limitedBody')}
          </p>
          <a
            href="/pay"
            className="inline-block bg-brand-900 text-white text-sm font-semibold px-4 py-2 rounded-xl"
          >
            {t('upgradeCta')}
          </a>
        </div>
      )}

      {/* Entry list */}
      {loading ? (
        <p role="status" className="text-gray-600 text-sm text-center py-8">{t('loading')}</p>
      ) : loadError ? (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-center">
          <p className="text-sm text-red-800">{t('errorLoad')}</p>
          <button
            onClick={() => {
              setLoading(true)
              loadEntries()
            }}
            className="mt-3 min-h-11 rounded-xl border border-red-200 bg-white px-4 text-sm font-semibold text-red-800"
          >
            {t('retry')}
          </button>
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-600 text-sm">{t('emptyTitle')}</p>
          <p className="text-gray-600 text-sm mt-1">
            {t('emptyBody')}
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
                <span className="text-xs text-gray-600">
                  {new Date(entry.created_at).toLocaleDateString(locale, {
                    day: 'numeric', month: 'short', year: 'numeric'
                  })}
                </span>
                {entry.symptom_focus && (
                  <span className="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">
                    {symptomLabel(entry.symptom_focus)}
                  </span>
                )}
              </div>

              {entry.plan_item_title && (
                <p className="text-sm font-medium text-gray-700 mb-1">
                  <Target aria-hidden="true" className="mr-1 inline h-4 w-4 align-text-bottom" />
                  {entry.plan_item_title}
                  {entry.days_tried && (
                    <span className="text-gray-600 font-normal">
                      {' '}· {t('day', { count: entry.days_tried })}
                    </span>
                  )}
                </p>
              )}

              {entry.perceived_effect && (
                <p className="text-sm text-gray-600 mb-1">
                  {EFFECT_KEYS.includes(entry.perceived_effect as EffectKey)
                    ? t(`effects.${entry.perceived_effect as EffectKey}`)
                    : entry.perceived_effect}
                  {entry.would_continue !== null && (
                    <span className="ml-2 text-gray-600">
                      · {entry.would_continue ? t('wouldContinue') : t('wouldNotContinue')}
                    </span>
                  )}
                </p>
              )}

              {entry.content && (
                <p className="text-sm text-gray-600 mt-2 leading-relaxed whitespace-pre-line break-words">
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
