'use client'

import { BookOpen, Brain, Flower2, NotebookPen, Sparkles, Stethoscope } from 'lucide-react'
import IconBadge from '@/components/ui/IconBadge'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Logo from '@/components/ui/Logo'

// Stored values; labels live in Waitlist.symptoms.<value>.
const SYMPTOM_OPTIONS = [
  'hot_flashes', 'night_sweats', 'sleep_problems', 'mood_changes', 'anxiety',
  'brain_fog', 'weight_changes', 'fatigue', 'low_libido', 'other',
] as const

const STAT_KEYS = ['libido', 'uk', 'world'] as const
const EXPECT_KEYS = ['plan', 'guidance', 'journal', 'articles', 'gp'] as const
const EXPECT_ICONS = { plan: Sparkles, guidance: Brain, journal: NotebookPen, articles: BookOpen, gp: Stethoscope } as const

function WaitlistForm() {
  const t = useTranslations('Waitlist')
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
        // The API's message is English: log it, show hers.
        console.error('waitlist join failed:', res.status, data.error)
        setError(t('errorGeneric'))
        setLoading(false)
        return
      }

      setReferralUrl(data.referral_url)
      setIsPriority(data.priority_access)
      setDone(true)
    } catch {
      setError(t('errorGeneric'))
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
      <div className="min-h-screen bg-cream flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm space-y-6">
          {/* Header */}
          <div className="text-center">
            <IconBadge icon={Flower2} />
            <h1 className="text-2xl font-bold text-brand-900">
              {isPriority ? t('doneTitlePriority') : t('doneTitle')}
            </h1>
            {isPriority && (
              <div className="inline-block bg-brand-900 text-white text-xs font-semibold px-3 py-1 rounded-full mt-2">
                {t('priorityBadge')}
              </div>
            )}
            <p className="text-gray-500 text-sm mt-3 leading-relaxed">
              {t('doneBody', { name: firstName })}
            </p>
          </div>

          {/* Referral reward */}
          <div className="bg-white rounded-2xl p-5 border border-brand-100 shadow-sm">
            <h2 className="font-bold text-brand-900 mb-1">
              {t('rewardTitle')}
            </h2>
            <p className="text-sm text-gray-600 mb-4 leading-relaxed">
              {t.rich('rewardBody', { strong: (chunks) => <strong>{chunks}</strong> })}
            </p>

            {/* Referral link */}
            <div className="bg-brand-50 rounded-xl p-3 mb-3">
              <p className="text-xs text-gray-500 mb-1">{t('linkLabel')}</p>
              <p className="text-xs font-mono text-brand-900 break-all leading-relaxed">
                {referralUrl}
              </p>
            </div>

            <button
              onClick={copyLink}
              className="w-full bg-brand-900 text-white font-semibold py-3 rounded-xl text-sm transition-colors hover:bg-brand-800"
            >
              {copied ? t('copied') : t('copy')}
            </button>
          </div>

          {/* Share options */}
          <div>
            <p className="text-xs text-center text-gray-600 mb-3">{t('shareVia')}</p>
            <div className="flex gap-2">
              <a
                href={`https://wa.me/?text=${encodeURIComponent(t('whatsappText', { url: referralUrl }))}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 bg-green-500 text-white text-sm font-medium py-2 rounded-xl hover:bg-green-600 transition-colors"
              >
                WhatsApp
              </a>
              <a
                href={`mailto:?subject=${encodeURIComponent(t('emailSubject'))}&body=${encodeURIComponent(t('emailBody', { url: referralUrl }))}`}
                className="flex-1 flex items-center justify-center gap-2 bg-gray-700 text-white text-sm font-medium py-2 rounded-xl hover:bg-gray-800 transition-colors"
              >
                {t('email')}
              </a>
            </div>
          </div>

          {/* Disclaimer */}
          <p className="text-xs text-center text-gray-600 leading-relaxed">
            {t('disclaimerDone')}
          </p>
        </div>
      </div>
    )
  }

  // ── Signup form ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-cream">
      <div className="max-w-lg mx-auto px-6 py-12">

        {/* Priority badge */}
        {refCode && (
          <div className="text-center mb-6">
            <div className="inline-block bg-brand-900 text-white text-xs font-semibold px-4 py-1.5 rounded-full">
              {t('referredBadge')}
            </div>
          </div>
        )}

        {/* Hero — manifesto */}
        <div className="text-center mb-10">
          <div className="flex justify-center mb-5">
            <Logo size="lg" />
          </div>
          <h1 className="text-3xl font-bold text-brand-900 leading-tight mb-4">
            {t('heroTitle')}
          </h1>
          <p className="text-gray-600 leading-relaxed text-sm mb-4">
            {t('hero1')}
          </p>
          <p className="text-gray-600 leading-relaxed text-sm mb-4">
            {t('hero2')}
          </p>
          <p className="text-brand-900 font-semibold leading-relaxed text-sm">
            {t('hero3')}
          </p>
        </div>

        {/* Social proof */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          {STAT_KEYS.map((key) => ({ stat: t(`stats.${key}.stat`), label: t(`stats.${key}.label`) })).map((item) => (
            <div key={item.stat} className="bg-white rounded-2xl p-3 text-center border border-gray-100 shadow-sm">
              <p className="text-lg font-bold text-brand-900">{item.stat}</p>
              <p className="text-xs text-gray-500 leading-tight mt-1">{item.label}</p>
            </div>
          ))}
        </div>

        {/* Form */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h2 className="font-bold text-gray-900 mb-1">{t('formTitle')}</h2>
          <p className="text-sm text-gray-500 mb-5">
            {t('formIntro')}
            {refCode ? ` ${t('formIntroReferred')}` : ''}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="wl-field-1" className="text-sm font-medium text-gray-700 block mb-1">
                {t('firstName')}
              </label>
              <input id="wl-field-1"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                placeholder={t('firstNamePlaceholder')}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
              />
            </div>

            <div>
              <label htmlFor="wl-field-2" className="text-sm font-medium text-gray-700 block mb-1">
                {t('emailLabel')}
              </label>
              <input id="wl-field-2"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder={t('emailPlaceholder')}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
              />
            </div>

            {/* Optional symptom question — research value */}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">
                {t('symptomLabel')}{' '}
                <span className="text-gray-600 font-normal">{t('optional')}</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {SYMPTOM_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setSymptom(symptom === opt ? '' : opt)}
                    className={`text-left text-xs px-3 py-2 rounded-xl border transition-all ${
                      symptom === opt
                        ? 'bg-brand-900 text-white border-brand-900'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'
                    }`}
                  >
                    {t(`symptoms.${opt}`)}
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
              {loading ? t('joining') : refCode ? t('submitReferred') : t('submit')}
            </button>

            <p className="text-xs text-center text-gray-600 leading-relaxed">
              {t('noSpam')}
            </p>
          </form>
        </div>

        {/* What to expect */}
        <div className="mt-8 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">
            {t('expectTitle')}
          </p>
          {EXPECT_KEYS.map((key) => ({ Icon: EXPECT_ICONS[key], text: t(`expect.${key}`) })).map((item) => (
            <div key={item.text} className="flex items-start gap-3">
              <item.Icon aria-hidden="true" className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand-700" />
              <p className="text-sm text-gray-600 leading-snug">{item.text}</p>
            </div>
          ))}
        </div>

        {/* Referral incentive reminder */}
        <div className="mt-8 bg-brand-50 rounded-2xl p-5 border border-brand-100">
          <h3 className="font-bold text-brand-900 text-sm mb-2">
            {t('referTitle')}
          </h3>
          <p className="text-xs text-brand-700 leading-relaxed">
            {t('referBody')}
          </p>
        </div>

      </div>
    </div>
  )
}

function WaitlistLoading() {
  const t = useTranslations('Waitlist')
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-brand-900">{t('loading')}</div>
    </div>
  )
}

export default function WaitlistPage() {
  return (
    <Suspense fallback={<WaitlistLoading />}>
      <WaitlistForm />
    </Suspense>
  )
}
