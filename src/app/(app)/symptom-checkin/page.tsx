'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { SymptomKey } from '@/types/database'

const SYMPTOMS: { key: SymptomKey; label: string }[] = [
  { key: 'hot_flashes', label: 'Hot flushes' },
  { key: 'night_sweats', label: 'Night sweats' },
  { key: 'sleep_problems', label: 'Sleep problems' },
  { key: 'mood_changes', label: 'Mood changes' },
  { key: 'anxiety', label: 'Anxiety' },
  { key: 'brain_fog', label: 'Brain fog' },
  { key: 'fatigue', label: 'Fatigue' },
  { key: 'low_libido', label: 'Low libido' },
]

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
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-gray-700 flex-1">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((v) => (
          <button
            key={v}
            onClick={() => onChange(severity === v ? null : v)}
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
  const router = useRouter()
  const today = new Date().toISOString().split('T')[0]

  const [symptoms, setSymptoms] = useState<Partial<Record<SymptomKey, number>>>({})
  const [moodScore, setMoodScore] = useState(3)
  const [energyLevel, setEnergyLevel] = useState(3)
  const [sleepHours, setSleepHours] = useState(7)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

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

  async function saveCheckin() {
    setSaving(true)
    setError('')

    try {
      const res = await fetch('/api/symptom-checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkin_date: today,
          symptoms,
          mood_score: moodScore,
          energy_level: energyLevel,
          sleep_hours: sleepHours,
          tried_today: [],
          notes: notes.trim() || null,
        }),
      })

      if (!res.ok) throw new Error('Failed to save')

      router.push('/dashboard')
    } catch {
      setError('Could not save your check-in. Please try again.')
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 py-4">
      <div>
        <h1 className="text-2xl font-bold text-brand-900">Daily check-in</h1>
        <p className="text-gray-500 text-sm mt-1">
          {new Date().toLocaleDateString('en-GB', {
            weekday: 'long', day: 'numeric', month: 'long',
          })}
        </p>
      </div>

      {/* Symptom severity */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <h2 className="font-semibold text-gray-900 mb-1">Symptoms today</h2>
        <p className="text-xs text-gray-400 mb-4">
          Tap a number to rate severity (1 = mild, 5 = severe). Skip any that don&apos;t apply today.
        </p>
        <div className="divide-y divide-gray-50">
          {SYMPTOMS.map(({ key, label }) => (
            <SymptomRow
              key={key}
              label={label}
              severity={symptoms[key] ?? null}
              onChange={(v) => setSymptom(key, v)}
            />
          ))}
        </div>
      </div>

      {/* Mood, energy, sleep */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-5">
        <h2 className="font-semibold text-gray-900">Overall today</h2>

        <ScaleInput
          label="Mood"
          value={moodScore}
          onChange={setMoodScore}
          low="Low / difficult"
          high="Great"
        />
        <ScaleInput
          label="Energy"
          value={energyLevel}
          onChange={setEnergyLevel}
          low="Exhausted"
          high="Full of energy"
        />

        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">Hours of sleep last night</span>
            <span className="text-sm font-bold text-brand-900">{sleepHours}h</span>
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
            <span>0h</span>
            <span>12h</span>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <h2 className="font-semibold text-gray-900 mb-3">Notes (optional)</h2>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything you noticed today? Triggers, patterns, things that helped..."
          rows={3}
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-300"
        />
      </div>

      {error && (
        <p className="text-red-600 text-sm bg-red-50 rounded-xl px-4 py-2">{error}</p>
      )}

      <button
        onClick={saveCheckin}
        disabled={saving}
        className="w-full bg-brand-900 text-white font-semibold py-3 rounded-2xl hover:bg-brand-800 transition-colors disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save today\'s check-in'}
      </button>
    </div>
  )
}
