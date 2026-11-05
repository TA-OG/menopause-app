import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import Logo from '@/components/ui/Logo'

export default async function LandingPage() {
  const t = await getTranslations('Landing')
  const features = [
    { emoji: '✨', key: 'plan' },
    { emoji: '📓', key: 'journal' },
    { emoji: '📚', key: 'knowledge' },
  ] as const

  return (
    <main className="min-h-screen bg-gradient-to-b from-cream to-white">
      {/* Nav — auth links only, logo lives in the hero */}
      <nav className="flex items-center justify-end px-6 py-4 max-w-4xl mx-auto">
        <div className="flex gap-3">
          <Link
            href="/auth/sign-in"
            className="text-brand-900 font-medium px-4 py-2 rounded-xl hover:bg-brand-100 transition-colors"
          >
            {t('signIn')}
          </Link>
          <Link
            href="/auth/sign-up"
            className="bg-brand-900 text-white font-medium px-4 py-2 rounded-xl hover:bg-brand-800 transition-colors"
          >
            {t('getStarted')}
          </Link>
        </div>
      </nav>

      {/* Hero — manifesto */}
      <section className="text-center px-6 pt-4 pb-16 max-w-2xl mx-auto">

        {/* Logo — large and centred above the headline */}
        <div className="flex justify-center mb-8">
          <Logo size="xl" />
        </div>

        <p className="text-base text-gray-700 mb-5 leading-relaxed">
          {t.rich('manifesto1', { em: (chunks) => <em>{chunks}</em> })}
        </p>
        <p className="text-base text-gray-700 mb-8 leading-relaxed">
          {t.rich('manifesto2', {
            strong: (chunks) => <span className="font-semibold text-brand-900">{chunks}</span>,
          })}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/waitlist"
            className="inline-block bg-brand-900 text-white font-semibold px-8 py-4 rounded-2xl text-lg hover:bg-brand-800 transition-colors"
          >
            {t('joinWaitlist')}
          </Link>
          <Link
            href="/auth/sign-up"
            className="inline-block border border-brand-300 text-brand-900 font-semibold px-8 py-4 rounded-2xl text-lg hover:bg-brand-50 transition-colors"
          >
            {t('getStarted')}
          </Link>
        </div>
        <p className="mt-3 text-sm text-gray-400">{t('noCard')}</p>
      </section>

      {/* What you get */}
      <section className="max-w-2xl mx-auto px-6 pb-16">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-12">
          {features.map((item) => (
            <div key={item.key} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm text-center">
              <div className="text-3xl mb-2">{item.emoji}</div>
              <p className="font-bold text-brand-900 text-sm mb-1">{t(`features.${item.key}.title`)}</p>
              <p className="text-xs text-gray-500 leading-relaxed">{t(`features.${item.key}.desc`)}</p>
            </div>
          ))}
        </div>

        {/* Disclaimer */}
        <p className="text-xs text-center text-gray-400 leading-relaxed">{t('disclaimer')}</p>
      </section>
    </main>
  )
}
