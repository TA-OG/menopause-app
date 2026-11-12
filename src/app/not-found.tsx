import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import Logo from '@/components/ui/Logo'

// Served for any unknown URL and for notFound() calls (e.g. an unpublished
// article slug). Lives under the root layout, so it keeps the locale provider.
export default async function NotFound() {
  const t = await getTranslations('NotFound')
  return (
    <main className="flex min-h-screen items-center justify-center bg-cream px-6">
      <div className="w-full max-w-sm text-center">
        <div className="mb-6 flex justify-center">
          <Logo size="lg" />
        </div>
        <h1 className="mb-2 text-2xl font-bold text-brand-900">{t('title')}</h1>
        <p className="mb-6 text-base leading-relaxed text-gray-600">{t('body')}</p>
        <Link
          href="/"
          className="inline-block rounded-2xl bg-brand-900 px-6 py-3 font-semibold text-white transition-colors hover:bg-brand-800"
        >
          {t('home')}
        </Link>
      </div>
    </main>
  )
}
