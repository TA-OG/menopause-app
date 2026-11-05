'use client'

import { useCallback, useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { SymptomCheckin, SymptomKey } from '@/types/database'
import {
  buildCheckinPayload,
  localCalendarDate,
  parseLocalCalendarDate,
} from '@/lib/checkin-schema'

/** The symptoms the form offers. Labels come from the Symptoms messages. */
const SYMPTOMS: SymptomKey[] = [
  'hot_flashes',
  'night_sweats',
  'sleep_problems',
  'mood_changes',
  'anxiety',
  'brain_fog',
  'fatigue',
  'low_libido',
]

const DEFAULT_MOOD = 3
const DEFAULT_ENERGY = 3
const DEFAULT_SLEEP = 7

function ScaleInput({
  label, value, onChange, low, high,
}: {
  label: string
  value: number
  onChange: (_v: number) => void
  low: string
  high: string
}) {
  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className="text-sm font-bold text-brand-900">{value}/5</span>
      </div>
      <input
        type="range"
        min={1}
        max={5}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-brand-700"
      />
      <div className="flex justify-between text-xs text-gray-400 mt-1">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  )
}

function SymptomRow({
  label, severity, onChange,
}: {
  label: string
  severity: number | null
  onChange: (_v: number | null) => void
}) {
  const t = useTranslations('Checkin')
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-gray-700 flex-1">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(severity === v ? null : v)}
            aria-pressed={severity === v}
            aria-label={t('severityAria', { label, value: v })}
            className={`w-8 h-8 rounded-full text-xs font-bold transition-all ${
              severity === v
                ? 'bg-brand-900 text-white'
                : 'bg-gray-100 text-gray-400 hover:bg-brand-100'
            }`}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function SymptomCheckinPage() {
  const symptomLabel = useTranslations('Symptoms')
  const historyText = useTranslations('CheckinHistory')
  const t = useTranslations('Checkin')
  const locale = useLocale()

  // Captured once, from the user's LOCAL calendar — not the UTC date. Held in
  // state so the header, the entry we load, and the row we upsert can never
  // disagree about which day this check-in belongs to.
  const [today] = useState(localCalendarDate)

  const [symptoms, setSymptoms] = useState<Partial<Record<SymptomKey, number>>>({})
  const [moodScore, setMoodScore] = useState(DEFAULT_MOOD)
  const [energyLevel, setEnergyLevel] = useState(DEFAULT_ENERGY)
  const [sleepHours, setSleepHours] = useState(DEFAULT_SLEEP)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [alreadyLogged, setAlreadyLogged] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Load any check-in already saved for today. Saving upserts on
  // (user_id, checkin_date), so without this a user who re-opens the form
  // would silently overwrite what they logged earlier with blank defaults.
  useEffect(() => {
    let cancelled = false

    async function loadToday() {
      try {
        const res = await fetch(`/api/symptom-checkin?date=${today}`)
        if (!res.ok) return // Non-fatal: fall back to a blank form.

        const { data } = (await res.json()) as { data: SymptomCheckin[] | null }
        const existing = data?.[0]
        if (cancelled || !existing) return

        setSymptoms(existing.symptoms ?? {})
        if (existing.mood_score !== null) setMoodScore(existing.mood_score)
        if (existing.energy_level !== null) setEnergyLevel(existing.energy_level)
        if (existing.sleep_hours !== null) setSleepHours(Number(existing.sleep_hours))
        setNotes(existing.notes ?? '')
        setAlreadyLogged(true)
      } catch {
        // Offline or a transient failure — a blank form is still usable.
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadToday()
    return () => { cancelled = true }
  }, [today])

  function setSymptom(key: SymptomKey, value: number | null) {
    setSymptoms((prev) => {
      const next = { ...prev }
      if (value === null) {
        delete next[key]
      } else {
        next[key] = value
      }
      return next
    })
  }

  const saveCheckin = useCallback(async () => {
    setSaving(true)
    setError('')

    try {
      const res = await fetch('/api/symptom-checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // One definition of this payload, shared with the tests that guard it.
        // It deliberately omits `tried_today`: the route upserts, so sending
        // the empty array this used to send would blank the column out on
        // every check-in. See FIELDS_THE_CHECKIN_FORM_MUST_NOT_SEND.
        body: JSON.stringify(
          buildCheckinPayload({
            checkin_date: today,
            symptoms,
            mood_score: moodScore,
            energy_level: energyLevel,
            sleep_hours: sleepHours,
            notes,
          })
        ),
      })

      if (!res.ok) {
        // Tell the user what actually happened. A session that expired needs a
        // sign-in, not a retry, and "try again" is actively wrong for a 429.
        if (res.status === 401) {
          setError(t('errorSession'))
        } else if (res.status === 429) {
          setError(t('errorRateLimit'))
        } else {
          // The API's message is English and technical: log it, show hers.
          const message = await res.json()
            .then((body: { error?: string }) => body?.error)
            .catch(() => undefined)
          console.error('check-in save failed:', res.status, message)
          setError(t('errorSave'))
        }
        setSaving(false)
        return
      }

      // Straight to her history, so saving shows her where it went and how
      // it fits with the days before. A full navigation, not router.push:
      // Next 14's client router cache can serve a history page visited in the
      // last 30s, which would be missing the check-in she just saved.
      window.location.assign('/symptom-checkin/history?saved=1')
    } catch {
      setError(t('errorNetwork'))
      setSaving(false)
    }
  }, [today, symptoms, moodScore, energyLevel, sleepHours, notes, t])

  const headerDate = parseLocalCalendarDate(today) ?? new Date()

  return (
    <div className="space-y-6 py-4">
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-2xl font-bold text-brand-900">{t('title')}</h1>
          <a
            href="/symptom-checkin/history"
            className="inline-flex min-h-11 items-center text-sm font-medium text-brand-700"
          >
            {historyText('formLink')}
          </a>
        </div>
        <p className="text-gray-500 text-sm mt-1">
          {headerDate.toLocaleDateString(locale, {
            weekday: 'long', day: 'numeric', month: 'long',
          })}
        </p>
        {alreadyLogged && (
          <p className="text-brand-700 text-sm mt-2">
            {t('alreadyLogged')}
          </p>
        )}
      </div>

      {/* Symptom severity */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <h2 className="font-semibold text-gray-900 mb-1">{t('symptomsTitle')}</h2>
        <p className="text-xs text-gray-400 mb-4">{t('symptomsHelp')}</p>
        <div className="divide-y divide-gray-50">
          {SYMPTOMS.map((key) => (
            <SymptomRow
              key={key}
              label={symptomLabel(key)}
              severity={symptoms[key] ?? null}
              onChange={(v) => setSymptom(key, v)}
            />
          ))}
        </div>
      </div>

      {/* Mood, energy, sleep */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-5">
        <h2 className="font-semibold text-gray-900">{t('overallTitle')}</h2>

        <ScaleInput
          label={t('mood')}
          value={moodScore}
          onChange={setMoodScore}
          low={t('moodLow')}
          high={t('moodHigh')}
        />
        <ScaleInput
          label={t('energy')}
          value={energyLevel}
          onChange={setEnergyLevel}
          low={t('energyLow')}
          high={t('energyHigh')}
        />

        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">{t('sleepTitle')}</span>
            <span className="text-sm font-bold text-brand-900">{t('hours', { value: sleepHours })}</span>
          </div>
          <input
            type="range"
            min={0}
            max={12}
            step={0.5}
            value={sleepHours}
            onChange={(e) => setSleepHours(Number(e.target.value))}
            className="w-full accent-brand-700"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>{t('hours', { value: 0 })}</span>
            <span>{t('hours', { value: 12 })}</span>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <h2 className="font-semibold text-gray-900 mb-3">{t('notesTitle')}</h2>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t('notesPlaceholder')}
          rows={3}
          maxLength={2000}
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-300"
        />
      </div>

      {error && (
        <p role="alert" className="text-red-600 text-sm bg-red-50 rounded-xl px-4 py-2">{error}</p>
      )}

      <button
        type="button"
        onClick={saveCheckin}
        disabled={saving || loading}
        className="w-full bg-brand-900 text-white font-semibold py-3 rounded-2xl hover:bg-brand-800 transition-colors disabled:opacity-50"
      >
        {loading ? t('loading') : saving ? t('saving') : t('save')}
      </button>
    </div>
  )
}
