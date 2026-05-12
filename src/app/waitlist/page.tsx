'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

const SYMPTOM_OPTIONS = [
  { value: 'hot_flashes', label: '🔥 Hot flushes' },
  { value: 'night_sweats', label: '🌙 Night sweats' },
  { value: 'sleep_problems', label: '😴 Sleep problems' },
  { value: 'mood_changes', label: '🌊 Mood changes' },
  { value: 'anxiety', label: '💭 Anxiety' },
  { value: 'brain_fog', label: '🌫️ Brain fog' },
  { value: 'weight_changes', label: '⚖️ Weight changes' },
  { value: 'fatigue', label: '🔋 Fatigue' },
  { value: 'low_libido', label: '💔 Low libido' },
  { value: 'other', label: '✨ Something else' },
]

function WaitlistForm() {
  const searchParams = useSearchParams()
  const refCode = searchParams.get('ref')

  const [firstName, setFirstName] = useState('')
  const [email, setEmail] = useState('')
  const [symptom, setSymptom] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [referralUrl, setReferralUrl] = useState('')
  const [isPriority, setIsPriority] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    // Show priority badge if referred
    if (refCode) setIsPriority(true)
  }, [refCode])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          first_name: firstName.trim(),
          primary_symptom: symptom || undefined,
          referral_code: refCode || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Please try again.')
        setLoading(false)
        return
      }

      setReferralUrl(data.referral_url)
      setIsPriority(data.priority_access)
      setDone(true)
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(referralUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for older browsers
      const input = document.createElement('input')
      input.value = referralUrl
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // ── Success state ────────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-brand-50 to-white flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm space-y-6">
          {/* Header */}
          <div className="text-center">
            <div className="text-5xl mb-3">🌸</div>
            <h1 className="text-2xl font-bold text-brand-900">
              {isPriority ? "You're first in line" : "You're on the list"}
            </h1>
            {isPriority && (
              <div className="inline-block bg-brand-900 text-white text-xs font-semibold px-3 py-1 rounded-full mt-2">
                ✨ Priority early access
              </div>
            )}
            <p className="text-gray-500 text-sm mt-3 leading-relaxed">
              We'll email you the moment we launch, {firstName}.
              Check your inbox for your welcome email.
            </p>
          </div>

          {/* Referral reward */}
          <div className="bg-white rounded-2xl p-5 border border-brand-100 shadow-sm">
            <h2 className="font-bold text-brand-900 mb-1">
              Earn 99p off per referral — forever
            </h2>
            <p className="text-sm text-gray-600 mb-4 leading-relaxed">
              Every woman you refer gets priority early access.
              You get <strong>99p off your subscription every month, for life.</strong>{' '}
              Refer 8 women and your subscription is completely free.
            </p>

            {/* Referral link */}
            <div className="bg-brand-50 rounded-xl p-3 mb-3">
              <p className="text-xs text-gray-500 mb-1">Your personal referral link</p>
              <p className="text-xs font-mono text-brand-900 break-all leading-relaxed">
                {referralUrl}
              </p>
            </div>

            <button
              onClick={copyLink}
              className="w-full bg-brand-900 text-white font-semibold py-3 rounded-xl text-sm transition-colors hover:bg-brand-800"
            >
              {copied ? '✓ Copied!' : 'Copy your referral link'}
            </button>
          </div>

          {/* Share options */}
          <div>
            <p className="text-xs text-center text-gray-400 mb-3">Share via</p>
            <div className="flex gap-2">
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`I just joined the waitlist for Aunty Mel — a new menopause wellness app. Use my link to get priority early access: ${referralUrl}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 bg-green-500 text-white text-sm font-medium py-2 rounded-xl hover:bg-green-600 transition-colors"
              >
                WhatsApp
              </a>
              <a
                href={`mailto:?subject=You need Aunty Mel in your life&body=I just joined the waitlist for Aunty Mel — a menopause wellness app that actually gets it. Use my link to get priority early access: ${referralUrl}`}
                className="flex-1 flex items-center justify-center gap-2 bg-gray-700 text-white text-sm font-medium py-2 rounded-xl hover:bg-gray-800 transition-colors"
              >
                Email
              </a>
            </div>
          </div>

          {/* Disclaimer */}
          <p className="text-xs text-center text-gray-400 leading-relaxed">
            General wellness guidance only — not medical advice.
            Always consult your GP for medical concerns.
          </p>
        </div>
      </div>
    )
  }

  // ── Signup form ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 to-white">
      <div className="max-w-lg mx-auto px-6 py-12">

        {/* Priority badge */}
        {refCode && (
          <div className="text-center mb-6">
            <div className="inline-block bg-brand-900 text-white text-xs font-semibold px-4 py-1.5 rounded-full">
              ✨ You've been referred — you'll get priority early access
            </div>
          </div>
        )}

        {/* Hero — manifesto */}
        <div className="text-center mb-10">
          <div className="text-5xl mb-4">🌸</div>
          <h1 className="text-3xl font-bold text-brand-900 leading-tight mb-4">
            Every body needs an Aunty Mel
          </h1>
          <p className="text-gray-600 leading-relaxed text-sm mb-4">
            For eons, the secrets of menopause have been passed from mother to daughter,
            aunty to niece, grandmother to granddaughter — carried in shared experience,
            in quiet conversations, in the wisdom of women who had already been through it.
          </p>
          <p className="text-gray-600 leading-relaxed text-sm mb-4">
            That knowledge was never lost. It just needs a home.
          </p>
          <p className="text-brand-900 font-semibold leading-relaxed text-sm">
            Aunty Mel is that home. Personalised wellness guidance — built on
            Pamela&apos;s specialist expertise — to help you understand your body,
            get real results, and have a more powerful conversation with your doctor.
          </p>
        </div>

        {/* Social proof */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          {[
            { stat: '40–55%', label: 'of women experience low libido during menopause' },
            { stat: '13M', label: 'peri/post-menopausal women in the UK alone' },
            { stat: '1B+', label: 'women worldwide in menopause by 2025' },
          ].map((item) => (
            <div key={item.stat} className="bg-white rounded-2xl p-3 text-center border border-gray-100 shadow-sm">
              <p className="text-lg font-bold text-brand-900">{item.stat}</p>
              <p className="text-xs text-gray-500 leading-tight mt-1">{item.label}</p>
            </div>
          ))}
        </div>

        {/* Form */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h2 className="font-bold text-gray-900 mb-1">Join the waitlist</h2>
          <p className="text-sm text-gray-500 mb-5">
            Be the first to know when we launch.
            {refCode ? ' You\'ll get priority early access.' : ''}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">
                First name
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                placeholder="Your first name"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="your@email.com"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
              />
            </div>

            {/* Optional symptom question — research value */}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">
                Which symptom bothers you most right now?{' '}
                <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {SYMPTOM_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSymptom(symptom === opt.value ? '' : opt.value)}
                    className={`text-left text-xs px-3 py-2 rounded-xl border transition-all ${
                      symptom === opt.value
                        ? 'bg-brand-900 text-white border-brand-900'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <p className="text-red-600 text-sm bg-red-50 rounded-xl px-4 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-900 text-white font-semibold py-3 rounded-xl hover:bg-brand-800 transition-colors disabled:opacity-50 text-sm"
            >
              {loading ? 'Joining...' : refCode ? 'Join — get priority access →' : 'Join the waitlist →'}
            </button>

            <p className="text-xs text-center text-gray-400 leading-relaxed">
              No spam. We&apos;ll only email you about the launch.
              General wellness guidance only — not medical advice.
            </p>
          </form>
        </div>

        {/* What to expect */}
        <div className="mt-8 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">
            What you&apos;ll get
          </p>
          {[
            { emoji: '✨', text: 'A personalised wellness plan built around your symptoms' },
            { emoji: '🧘', text: 'Diet, lifestyle, and mindset guidance from Pamela' },
            { emoji: '📓', text: 'A journal to track what works and what doesn\'t' },
            { emoji: '📚', text: 'Evidence-informed articles — real information, no fluff' },
            { emoji: '🩺', text: 'Empowerment to have better conversations with your GP' },
          ].map((item) => (
            <div key={item.text} className="flex items-start gap-3">
              <span className="text-lg flex-shrink-0">{item.emoji}</span>
              <p className="text-sm text-gray-600 leading-snug">{item.text}</p>
            </div>
          ))}
        </div>

        {/* Referral incentive reminder */}
        <div className="mt-8 bg-brand-50 rounded-2xl p-5 border border-brand-100">
          <h3 className="font-bold text-brand-900 text-sm mb-2">
            Refer a friend, get 99p off forever
          </h3>
          <p className="text-xs text-brand-700 leading-relaxed">
            Once you join, you&apos;ll get your own referral link.
            Every woman you refer gets priority early access.
            You get 99p off your monthly subscription — permanently — for every referral.
            Refer 8 women and your subscription is completely free.
          </p>
        </div>

      </div>
    </div>
  )
}

export default function WaitlistPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-brand-900">Loading...</div>
      </div>
    }>
      <WaitlistForm />
    </Suspense>
  )
}
