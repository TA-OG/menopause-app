import { Mail } from 'lucide-react'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

// FAQ keys, in display order. Questions and answers live in Support.faq.<key>.
const FAQ_KEYS = [
  'what',
  'medical',
  'login',
  'magicLink',
  'cancel',
  'refund',
  'updatePlan',
  'dataSafe',
  'delete',
  'devices',
  'surgical',
  'culture',
] as const

export async function generateMetadata() {
  const t = await getTranslations('Support.meta')
  return { title: t('title'), description: t('description') }
}

export default async function SupportPage() {
  const t = await getTranslations('Support')
  const tLegal = await getTranslations('Legal')

  return (
    <main className="min-h-screen bg-cream">
      <div className="max-w-2xl mx-auto px-6 py-12">

        {/* Header */}
        <div className="mb-10">
          <Link href="/" className="text-brand-700 text-sm font-medium hover:underline">
            {tLegal('back')}
          </Link>
          <h1 className="text-3xl font-bold text-brand-900 mt-4 mb-2">{t('title')}</h1>
          <p className="text-gray-500 text-sm">{t('intro')}</p>
        </div>

        {/* Contact card */}
        <div className="bg-white rounded-2xl p-6 border border-brand-100 mb-10">
          <h2 className="font-bold text-brand-900 mb-1">{t('contactTitle')}</h2>
          <p className="text-sm text-gray-600 mb-4">{t('contactBody')}</p>
          <div className="space-y-2">
            <a
              href="mailto:hello@auntymel.app"
              className="flex items-center gap-3 bg-brand-900 text-white font-semibold text-sm px-5 py-3 rounded-xl hover:bg-brand-800 transition-colors w-fit"
            >
              <Mail aria-hidden="true" className="h-4 w-4" />
              {t('emailButton', { email: 'hello@auntymel.app' })}
            </a>
            <p className="text-xs text-gray-600">
              {t('privacyRequests')}{' '}
              <a href="mailto:privacy@auntymel.app" className="underline">
                privacy@auntymel.app
              </a>
            </p>
          </div>
        </div>

        {/* FAQ */}
        <h2 className="text-xl font-bold text-brand-900 mb-4">{t('faqTitle')}</h2>
        <div className="space-y-3">
          {FAQ_KEYS.map((key) => (
            <details key={key} className="bg-white rounded-2xl border border-gray-100 group">
              <summary className="flex items-center justify-between px-5 py-4 cursor-pointer list-none font-medium text-gray-900 text-sm">
                {t(`faq.${key}.q`)}
                <span className="text-brand-500 text-lg ml-3 flex-shrink-0 group-open:rotate-45 transition-transform">+</span>
              </summary>
              <div className="px-5 pb-4 text-sm text-gray-600 leading-relaxed">
                {t(`faq.${key}.a`)}
              </div>
            </details>
          ))}
        </div>

        {/* Footer links */}
        <div className="border-t border-gray-200 pt-6 mt-10 flex flex-wrap gap-4 text-sm">
          <Link href="/privacy" className="text-brand-700 hover:underline">{tLegal('links.privacy')}</Link>
          <Link href="/terms" className="text-brand-700 hover:underline">{tLegal('links.termsRefund')}</Link>
          <Link href="/data-deletion" className="text-brand-700 hover:underline">{tLegal('links.dataDeletion')}</Link>
          <Link href="/" className="text-gray-600 hover:underline">{tLegal('backPlain')}</Link>
        </div>

      </div>
    </main>
  )
}
