'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

const RELATIONSHIP_OPTIONS = [
  { value: 'partner', label: '💑 Partner or spouse' },
  { value: 'adult_child', label: '👨‍👩‍👧 Adult son or daughter' },
  { value: 'friend', label: '👭 Close friend' },
  { value: 'other_family', label: '👨‍👩‍👦‍👦 Other family member' },
]

const MOTIVATION_OPTIONS = [
  { value: 'understand', label: 'I want to understand what she\'s going through' },
  { value: 'support', label: 'I want to know how to support her better' },
  { value: 'relationship', label: 'It\'s affecting our relationship and I want to help' },
  { value: 'her_idea', label: 'She told me about it and I want to be involved' },
  { value: 'curious', label: 'I\'m curious and want to learn more' },
]

function PartnerWaitlistForm() {
  const searchParams = useSearchParams()
  const refCode = searchParams.get('ref')

  const [firstName, setFirstName] = useState('')
  const [email, setEmail] = useState('')
  const [relationship, setRelationship] = useState('')
  const [motivation, setMotivation] = useState('')
  const [openQuestion, setOpenQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      // Reuse the main waitlist API with a partner tag
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          first_name: firstName.trim(),
          primary_symptom: `partner:${relationship}`, // Tag as partner signup
          referral_code: refCode || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Please try again.')
        setLoading(false)
        return
      }

      setDone(true)
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-brand-50 to-white flex items-center justify-center px-6">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="text-5xl">🌸</div>
          <h1 className="text-2xl font-bold text-brand-900">
            You&apos;re on the list, {firstName}
          </h1>
          <p className="text-gray-500 text-sm leading-relaxed">
            We&apos;re building something for you. When we launch partner support,
            you&apos;ll be the first to know. The fact that you&apos;re here means
            a lot — and so does she.
          </p>
          <div className="bg-white rounded-2xl p-5 border border-brand-100 text-left">
            <p className="text-sm font-semibold text-brand-900 mb-2">
              In the meantime
            </p>
            <p className="text-sm text-gray-600 leading-relaxed">
              The most helpful thing you can do right now is share Aunty Mel
              with her directly. She can join the main waitlist and get access
              the moment we launch.
            </p>
            <Link
              href="/waitlist"
              className="block mt-3 text-center bg-brand-900 text-white text-sm font-semibold px-4 py-2 rounded-xl"
            >
              Share Aunty Mel with her →
            </Link>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            Aunty Mel provides general wellness information only.
            Not medical advice. Always consult a GP for medical concerns.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 to-white">
      <div className="max-w-lg mx-auto px-6 py-12">

        {/* Back link */}
        <Link href="/waitlist" className="text-sm text-brand-700 font-medium mb-8 block">
          ← Back to Aunty Mel
        </Link>

        {/* Hero */}
        <div className="text-center mb-10">
          <div className="text-5xl mb-4">💙</div>
          <h1 className="text-3xl font-bold text-brand-900 leading-tight">
            You care. That matters.
          </h1>
          <p className="text-gray-500 mt-3 leading-relaxed text-sm">
            You&apos;re here because someone you love is going through something
            that&apos;s hard to understand from the outside. The fact that
            you&apos;re here at all puts you ahead of most.
          </p>
          <p className="text-gray-500 mt-3 leading-relaxed text-sm">
            We&apos;re building a way for partners and family members to
            understand menopause better — so you can support her in the way
            she actually needs. Join the list and be first to know when it launches.
          </p>
        </div>

        {/* Research stats */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm mb-8">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Why this matters
          </p>
          {[
            { stat: '76%', text: 'of partners say menopause symptoms affected them personally' },
            { stat: '55%', text: 'say it negatively impacted their relationship' },
            { stat: '74%', text: 'believe they are influential in her decision to seek support' },
          ].map((item) => (
            <div key={item.stat} className="flex items-start gap-3 mb-3 last:mb-0">
              <span className="text-brand-900 font-bold text-lg w-12 flex-shrink-0">{item.stat}</span>
              <p className="text-sm text-gray-600 leading-snug">{item.text}</p>
            </div>
          ))}
          <p className="text-xs text-gray-400 mt-3">Source: MATE Survey — the most comprehensive study of male partners and menopause</p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h2 className="font-bold text-gray-900 mb-1">Join the partner waitlist</h2>
          <p className="text-sm text-gray-500 mb-5">
            We&apos;ll let you know the moment partner support launches.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">
                Your first name
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
                Your email
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

            {/* Relationship */}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">
                Your relationship to her
              </label>
              <div className="space-y-2">
                {RELATIONSHIP_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setRelationship(opt.value)}
                    className={`w-full text-left text-sm px-4 py-2.5 rounded-xl border transition-all ${
                      relationship === opt.value
                        ? 'bg-brand-900 text-white border-brand-900'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Motivation — research question */}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">
                What brings you here? (optional)
              </label>
              <div className="space-y-2">
                {MOTIVATION_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setMotivation(motivation === opt.value ? '' : opt.value)}
                    className={`w-full text-left text-xs px-3 py-2 rounded-xl border transition-all ${
                      motivation === opt.value
                        ? 'bg-brand-900 text-white border-brand-900'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-brand-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Open question — most valuable research */}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">
                What do you most want to understand? (optional)
              </label>
              <textarea
                value={openQuestion}
                onChange={(e) => setOpenQuestion(e.target.value)}
                placeholder="What's the one thing you wish you understood better about what she's going through?"
                rows={3}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-300"
              />
            </div>

            {error && (
              <p className="text-red-600 text-sm bg-red-50 rounded-xl px-4 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !relationship}
              className="w-full bg-brand-900 text-white font-semibold py-3 rounded-xl hover:bg-brand-800 transition-colors disabled:opacity-40 text-sm"
            >
              {loading ? 'Joining...' : 'Join the partner waitlist →'}
            </button>

            <p className="text-xs text-center text-gray-400 leading-relaxed">
              No spam. We&apos;ll only email you about the partner support launch.
            </p>
          </form>
        </div>

        {/* Point to main app */}
        <div className="mt-8 bg-brand-50 rounded-2xl p-5 border border-brand-100">
          <p className="font-bold text-brand-900 text-sm mb-2">
            Want her to join too?
          </p>
          <p className="text-xs text-brand-700 leading-relaxed mb-3">
            Share the main Aunty Mel waitlist with her. She&apos;ll get priority
            early access when the app launches.
          </p>
          <Link
            href="/waitlist"
            className="block text-center border border-brand-300 text-brand-900 text-sm font-medium px-4 py-2 rounded-xl hover:bg-white transition-colors"
          >
            Share Aunty Mel with her →
          </Link>
        </div>

      </div>
    </div>
  )
}

export default function PartnerWaitlistPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-brand-900 text-sm">Loading...</div>
      </div>
    }>
      <PartnerWaitlistForm />
    </Suspense>
  )
}
