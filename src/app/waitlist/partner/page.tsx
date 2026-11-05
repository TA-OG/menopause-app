'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

// Stored values; labels live in WaitlistPartner.relationships.<value>.
const RELATIONSHIP_OPTIONS = ['partner', 'adult_child', 'friend', 'other_family'] as const

// Labels live in WaitlistPartner.motivations.<value>.
const MOTIVATION_OPTIONS = ['understand', 'support', 'relationship', 'her_idea', 'curious'] as const
const STAT_KEYS = ['affected', 'relationship', 'influential'] as const

function PartnerWaitlistForm() {
  const t = useTranslations('WaitlistPartner')
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
        // The API's message is English: log it, show theirs.
        console.error('partner waitlist join failed:', res.status, data.error)
        setError(t('errorGeneric'))
        setLoading(false)
        return
      }

      setDone(true)
    } catch {
      setError(t('errorGeneric'))
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-brand-50 to-white flex items-center justify-center px-6">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="text-5xl">🌸</div>
          <h1 className="text-2xl font-bold text-brand-900">
            {t('doneTitle', { name: firstName })}
          </h1>
          <p className="text-gray-500 text-sm leading-relaxed">
            {t('doneBody')}
          </p>
          <div className="bg-white rounded-2xl p-5 border border-brand-100 text-left">
            <p className="text-sm font-semibold text-brand-900 mb-2">
              {t('meantimeTitle')}
            </p>
            <p className="text-sm text-gray-600 leading-relaxed">
              {t('meantimeBody')}
            </p>
            <Link
              href="/waitlist"
              className="block mt-3 text-center bg-brand-900 text-white text-sm font-semibold px-4 py-2 rounded-xl"
            >
              {t('shareWithHer')}
            </Link>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            {t('disclaimer')}
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
          {t('back')}
        </Link>

        {/* Hero */}
        <div className="text-center mb-10">
          <div className="text-5xl mb-4">💙</div>
          <h1 className="text-3xl font-bold text-brand-900 leading-tight">
            {t('heroTitle')}
          </h1>
          <p className="text-gray-500 mt-3 leading-relaxed text-sm">
            {t('hero1')}
          </p>
          <p className="text-gray-500 mt-3 leading-relaxed text-sm">
            {t('hero2')}
          </p>
        </div>

        {/* Research stats */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm mb-8">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            {t('whyTitle')}
          </p>
          {STAT_KEYS.map((key) => ({ stat: t(`stats.${key}.stat`), text: t(`stats.${key}.text`) })).map((item) => (
            <div key={item.stat} className="flex items-start gap-3 mb-3 last:mb-0">
              <span className="text-brand-900 font-bold text-lg w-12 flex-shrink-0">{item.stat}</span>
              <p className="text-sm text-gray-600 leading-snug">{item.text}</p>
            </div>
          ))}
          <p className="text-xs text-gray-400 mt-3">{t('statsSource')}</p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h2 className="font-bold text-gray-900 mb-1">{t('formTitle')}</h2>
          <p className="text-sm text-gray-500 mb-5">
            {t('formIntro')}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">
                {t('firstName')}
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                placeholder={t('firstNamePlaceholder')}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">
                {t('emailLabel')}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder={t('emailPlaceholder')}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
              />
            </div>

            {/* Relationship */}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">
                {t('relationshipLabel')}
              </label>
              <div className="space-y-2">
                {RELATIONSHIP_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setRelationship(opt)}
                    className={`w-full text-left text-sm px-4 py-2.5 rounded-xl border transition-all ${
                      relationship === opt
                        ? 'bg-brand-900 text-white border-brand-900'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'
                    }`}
                  >
                    {t(`relationships.${opt}`)}
                  </button>
                ))}
              </div>
            </div>

            {/* Motivation — research question */}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">
                {t('motivationLabel')}
              </label>
              <div className="space-y-2">
                {MOTIVATION_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setMotivation(motivation === opt ? '' : opt)}
                    className={`w-full text-left text-xs px-3 py-2 rounded-xl border transition-all ${
                      motivation === opt
                        ? 'bg-brand-900 text-white border-brand-900'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-brand-300'
                    }`}
                  >
                    {t(`motivations.${opt}`)}
                  </button>
                ))}
              </div>
            </div>

            {/* Open question — most valuable research */}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">
                {t('openLabel')}
              </label>
              <textarea
                value={openQuestion}
                onChange={(e) => setOpenQuestion(e.target.value)}
                placeholder={t('openPlaceholder')}
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
              {loading ? t('joining') : t('submit')}
            </button>

            <p className="text-xs text-center text-gray-400 leading-relaxed">
              {t('noSpam')}
            </p>
          </form>
        </div>

        {/* Point to main app */}
        <div className="mt-8 bg-brand-50 rounded-2xl p-5 border border-brand-100">
          <p className="font-bold text-brand-900 text-sm mb-2">
            {t('herTooTitle')}
          </p>
          <p className="text-xs text-brand-700 leading-relaxed mb-3">
            {t('herTooBody')}
          </p>
          <Link
            href="/waitlist"
            className="block text-center border border-brand-300 text-brand-900 text-sm font-medium px-4 py-2 rounded-xl hover:bg-white transition-colors"
          >
            {t('shareWithHer')}
          </Link>
        </div>

      </div>
    </div>
  )
}

function PartnerWaitlistLoading() {
  const t = useTranslations('WaitlistPartner')
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-brand-900 text-sm">{t('loading')}</div>
    </div>
  )
}

export default function PartnerWaitlistPage() {
  return (
    <Suspense fallback={<PartnerWaitlistLoading />}>
      <PartnerWaitlistForm />
    </Suspense>
  )
}
