'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { DISCLAIMER } from '@/lib/disclaimer'

// ─── Step definitions ─────────────────────────────────────────────────────────

const STEPS = [
  'disclaimer',
  'name',
  'age',
  'stage',
  'symptoms',
  'primary_symptom',
  'goal',
  'diet',
  'exercise',
  'sleep',
  'stress',
  'previously_tried',
  'complete',
] as const

type Step = typeof STEPS[number]

interface Answers {
  full_name?: string
  age_range?: string
  menopause_stage?: string
  symptoms?: string[]
  primary_symptom?: string
  primary_goal?: string
  diet_type?: string
  exercise_level?: string
  sleep_quality?: string
  stress_level?: string
  previously_tried?: string[]
}

// ─── Option sets ──────────────────────────────────────────────────────────────

const AGE_OPTIONS = ['Under 40', '40–44', '45–49', '50–54', '55–59', '60+']

const STAGE_OPTIONS = [
  { value: 'unsure', label: "I'm not sure yet" },
  { value: 'perimenopause', label: "I think I'm in perimenopause" },
  { value: 'menopause', label: "I've been told I'm in menopause" },
  { value: 'postmenopause', label: "I'm postmenopausal" },
  { value: 'surgical', label: "I've had surgical menopause" },
]

const SYMPTOM_OPTIONS = [
  { value: 'hot_flashes', label: 'Hot flushes' },
  { value: 'night_sweats', label: 'Night sweats' },
  { value: 'sleep_problems', label: 'Sleep problems' },
  { value: 'mood_changes', label: 'Mood changes / irritability' },
  { value: 'anxiety', label: 'Anxiety' },
  { value: 'brain_fog', label: 'Brain fog / memory' },
  { value: 'weight_changes', label: 'Weight changes' },
  { value: 'joint_pain', label: 'Joint or muscle aches' },
  { value: 'fatigue', label: 'Low energy / fatigue' },
  { value: 'low_libido', label: 'Low libido' },
  { value: 'vaginal_dryness', label: 'Vaginal dryness' },
  { value: 'skin_changes', label: 'Skin changes' },
  { value: 'hair_changes', label: 'Hair changes' },
]

const GOAL_OPTIONS = [
  'Reduce physical symptoms',
  'Improve sleep',
  'Manage mood and stress',
  'Understand my body better',
  'Manage weight',
  'Boost energy',
  'Improve relationships and intimacy',
  'All of the above',
]

const DIET_OPTIONS = [
  { value: 'whole_foods', label: 'Mostly whole foods' },
  { value: 'mixed', label: 'Mixed — some healthy, some not' },
  { value: 'convenience', label: 'Convenience / fast food mostly' },
  { value: 'specific', label: 'I follow a specific diet (vegan, vegetarian etc.)' },
  { value: 'unaware', label: "I don't pay much attention to diet" },
]

const EXERCISE_OPTIONS = [
  { value: 'very_active', label: 'Very active (4+ days/week)' },
  { value: 'moderately_active', label: 'Moderately active (2–3 days/week)' },
  { value: 'lightly_active', label: 'Lightly active (walks, 1 day/week)' },
  { value: 'not_active', label: 'Not very active' },
  { value: 'limited', label: 'I have a condition that limits me' },
]

const SLEEP_OPTIONS = [
  { value: 'good', label: 'Good — I sleep well' },
  { value: 'fair', label: 'Fair — some disruption' },
  { value: 'poor', label: 'Poor — I struggle most nights' },
  { value: 'very_poor', label: 'Very poor — sleep is a major problem' },
]

const STRESS_OPTIONS = [
  { value: 'low', label: 'Low — I feel calm most of the time' },
  { value: 'moderate', label: 'Moderate — some stress but manageable' },
  { value: 'high', label: 'High — I feel stressed regularly' },
  { value: 'very_high', label: 'Very high — I feel overwhelmed' },
]

const TRIED_OPTIONS = [
  'Nothing yet',
  'Diet changes',
  'Exercise',
  'HRT',
  'Natural supplements',
  'Mindfulness / meditation',
  'Counselling or therapy',
  'Acupuncture',
  'Other',
]

// ─── Helper components ────────────────────────────────────────────────────────

function OptionButton({
  label, selected, onClick,
}: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-4 py-3 rounded-2xl border text-sm font-medium transition-all ${
        selected
          ? 'bg-brand-900 text-white border-brand-900'
          : 'bg-white text-gray-700 border-gray-200 hover:border-brand-300 hover:bg-brand-50'
      }`}
    >
      {label}
    </button>
  )
}

function PrimaryButton({
  label, onClick, disabled = false,
}: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full bg-brand-900 text-white font-semibold py-3 rounded-2xl hover:bg-brand-800 transition-colors disabled:opacity-40"
    >
      {label}
    </button>
  )
}

function StepHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-2xl font-bold text-brand-900 leading-tight">{title}</h2>
      {subtitle && <p className="text-gray-500 mt-2 text-sm leading-relaxed">{subtitle}</p>}
    </div>
  )
}

// ─── Main onboarding component ────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = createClient()
  const [stepIndex, setStepIndex] = useState(0)
  const [answers, setAnswers] = useState<Answers>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const step = STEPS[stepIndex]
  const progress = Math.round((stepIndex / (STEPS.length - 1)) * 100)

  function next() {
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1))
  }

  function back() {
    setStepIndex((i) => Math.max(i - 1, 0))
  }

  function toggleMulti(key: 'symptoms' | 'previously_tried', value: string) {
    const current = (answers[key] ?? []) as string[]
    const updated = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value]
    setAnswers({ ...answers, [key]: updated })
  }

  async function completeOnboarding() {
    setSaving(true)
    setError('')

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // Save all answers to onboarding_answers table
      const answerRows = Object.entries(answers)
        .filter(([, v]) => v !== undefined && v !== '')
        .flatMap(([key, value]) => {
          if (Array.isArray(value)) {
            return value.map((v) => ({
              user_id: user.id,
              question_key: key,
              answer_value: v,
            }))
          }
          return [{ user_id: user.id, question_key: key, answer_value: String(value) }]
        })

      const { error: answersError } = await supabase
        .from('onboarding_answers')
        .upsert(answerRows, { onConflict: 'user_id,question_key' })

      if (answersError) throw answersError

      // Update profile
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          full_name: answers.full_name,
          onboarding_complete: true,
          menopause_stage: answers.menopause_stage as any,
        })
        .eq('id', user.id)

      if (profileError) throw profileError

      // Save preferences
      const { error: prefError } = await supabase
        .from('user_preferences')
        .upsert({
          user_id: user.id,
          diet_type: answers.diet_type as any,
          exercise_level: answers.exercise_level as any,
          sleep_quality: answers.sleep_quality as any,
          stress_level: answers.stress_level as any,
        }, { onConflict: 'user_id' })

      if (prefError) throw prefError

      // Generate wellness plan
      await fetch('/api/wellness-plan', { method: 'POST' })

      router.push('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setSaving(false)
    }
  }

  // ─── Step renders ───────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 to-white">
      <div className="max-w-lg mx-auto px-6 py-8">

        {/* Progress bar */}
        {step !== 'disclaimer' && step !== 'complete' && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <button
                onClick={back}
                className="text-sm text-gray-400 hover:text-gray-600 font-medium"
              >
                ← Back
              </button>
              <span className="text-xs text-gray-400">{progress}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5">
              <div
                className="bg-brand-700 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* ── STEP: Disclaimer ── */}
        {step === 'disclaimer' && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="text-5xl mb-4">🌸</div>
              <h1 className="text-3xl font-bold text-brand-900">
                Welcome
              </h1>
              <p className="text-gray-500 mt-2">
                Let&apos;s build your personalised wellness plan.
              </p>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-brand-100">
              <p className="text-sm text-gray-600 leading-relaxed">
                {DISCLAIMER.full}
              </p>
            </div>
            <PrimaryButton label="I understand — let's start" onClick={next} />
          </div>
        )}

        {/* ── STEP: Name ── */}
        {step === 'name' && (
          <div className="space-y-6">
            <StepHeader
              title="What's your name?"
              subtitle="We'll use this to personalise your experience."
            />
            <input
              type="text"
              value={answers.full_name ?? ''}
              onChange={(e) => setAnswers({ ...answers, full_name: e.target.value })}
              placeholder="Your first name"
              className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
              autoFocus
            />
            <PrimaryButton
              label="Continue"
              onClick={next}
              disabled={!answers.full_name?.trim()}
            />
          </div>
        )}

        {/* ── STEP: Age ── */}
        {step === 'age' && (
          <div className="space-y-4">
            <StepHeader title="How old are you?" />
            <div className="space-y-2">
              {AGE_OPTIONS.map((opt) => (
                <OptionButton
                  key={opt}
                  label={opt}
                  selected={answers.age_range === opt}
                  onClick={() => { setAnswers({ ...answers, age_range: opt }); next() }}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── STEP: Stage ── */}
        {step === 'stage' && (
          <div className="space-y-4">
            <StepHeader
              title="Where are you in your menopause journey?"
              subtitle="It's okay if you're not sure — we'll help you understand."
            />
            <div className="space-y-2">
              {STAGE_OPTIONS.map((opt) => (
                <OptionButton
                  key={opt.value}
                  label={opt.label}
                  selected={answers.menopause_stage === opt.value}
                  onClick={() => { setAnswers({ ...answers, menopause_stage: opt.value }); next() }}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── STEP: Symptoms (multi-select) ── */}
        {step === 'symptoms' && (
          <div className="space-y-4">
            <StepHeader
              title="Which symptoms are you experiencing?"
              subtitle="Select all that apply."
            />
            <div className="space-y-2">
              {SYMPTOM_OPTIONS.map((opt) => (
                <OptionButton
                  key={opt.value}
                  label={opt.label}
                  selected={(answers.symptoms ?? []).includes(opt.value)}
                  onClick={() => toggleMulti('symptoms', opt.value)}
                />
              ))}
            </div>
            <PrimaryButton
              label="Continue"
              onClick={next}
              disabled={(answers.symptoms ?? []).length === 0}
            />
          </div>
        )}

        {/* ── STEP: Primary symptom ── */}
        {step === 'primary_symptom' && (
          <div className="space-y-4">
            <StepHeader
              title="Which symptom bothers you most right now?"
              subtitle="This helps us prioritise your plan."
            />
            <div className="space-y-2">
              {SYMPTOM_OPTIONS
                .filter((opt) => (answers.symptoms ?? []).includes(opt.value))
                .map((opt) => (
                  <OptionButton
                    key={opt.value}
                    label={opt.label}
                    selected={answers.primary_symptom === opt.value}
                    onClick={() => { setAnswers({ ...answers, primary_symptom: opt.value }); next() }}
                  />
                ))}
            </div>
          </div>
        )}

        {/* ── STEP: Goal ── */}
        {step === 'goal' && (
          <div className="space-y-4">
            <StepHeader
              title="What's your main goal with this app?"
            />
            <div className="space-y-2">
              {GOAL_OPTIONS.map((opt) => (
                <OptionButton
                  key={opt}
                  label={opt}
                  selected={answers.primary_goal === opt}
                  onClick={() => { setAnswers({ ...answers, primary_goal: opt }); next() }}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── STEP: Diet ── */}
        {step === 'diet' && (
          <div className="space-y-4">
            <StepHeader
              title="How would you describe your current diet?"
            />
            <div className="space-y-2">
              {DIET_OPTIONS.map((opt) => (
                <OptionButton
                  key={opt.value}
                  label={opt.label}
                  selected={answers.diet_type === opt.value}
                  onClick={() => { setAnswers({ ...answers, diet_type: opt.value }); next() }}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── STEP: Exercise ── */}
        {step === 'exercise' && (
          <div className="space-y-4">
            <StepHeader title="How active are you currently?" />
            <div className="space-y-2">
              {EXERCISE_OPTIONS.map((opt) => (
                <OptionButton
                  key={opt.value}
                  label={opt.label}
                  selected={answers.exercise_level === opt.value}
                  onClick={() => { setAnswers({ ...answers, exercise_level: opt.value }); next() }}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── STEP: Sleep ── */}
        {step === 'sleep' && (
          <div className="space-y-4">
            <StepHeader title="How would you rate your sleep quality right now?" />
            <div className="space-y-2">
              {SLEEP_OPTIONS.map((opt) => (
                <OptionButton
                  key={opt.value}
                  label={opt.label}
                  selected={answers.sleep_quality === opt.value}
                  onClick={() => { setAnswers({ ...answers, sleep_quality: opt.value }); next() }}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── STEP: Stress ── */}
        {step === 'stress' && (
          <div className="space-y-4">
            <StepHeader title="How is your stress level day-to-day?" />
            <div className="space-y-2">
              {STRESS_OPTIONS.map((opt) => (
                <OptionButton
                  key={opt.value}
                  label={opt.label}
                  selected={answers.stress_level === opt.value}
                  onClick={() => { setAnswers({ ...answers, stress_level: opt.value }); next() }}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── STEP: Previously tried (multi-select) ── */}
        {step === 'previously_tried' && (
          <div className="space-y-4">
            <StepHeader
              title="Have you tried anything to manage your symptoms?"
              subtitle="Select all that apply — we won't repeat what hasn't worked."
            />
            <div className="space-y-2">
              {TRIED_OPTIONS.map((opt) => (
                <OptionButton
                  key={opt}
                  label={opt}
                  selected={(answers.previously_tried ?? []).includes(opt)}
                  onClick={() => toggleMulti('previously_tried', opt)}
                />
              ))}
            </div>
            <PrimaryButton label="Build my plan →" onClick={next} />
          </div>
        )}

        {/* ── STEP: Complete ── */}
        {step === 'complete' && (
          <div className="space-y-6 text-center">
            <div className="text-6xl">✨</div>
            <div>
              <h2 className="text-2xl font-bold text-brand-900">
                Your plan is almost ready,{' '}
                {answers.full_name?.split(' ')[0] ?? 'there'}
              </h2>
              <p className="text-gray-500 mt-2 text-sm leading-relaxed">
                We&apos;re building your personalised wellness plan based on your answers.
                It takes just a moment.
              </p>
            </div>

            {error && (
              <p className="text-red-600 text-sm bg-red-50 rounded-xl px-4 py-2">{error}</p>
            )}

            <PrimaryButton
              label={saving ? 'Building your plan...' : 'See my plan →'}
              onClick={completeOnboarding}
              disabled={saving}
            />
          </div>
        )}

      </div>
    </div>
  )
}
