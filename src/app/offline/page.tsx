import { getTranslations } from 'next-intl/server'

export default async function OfflinePage() {
  const t = await getTranslations('Offline')
  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-brand-50">
      <div className="text-center max-w-sm">
        <div className="text-5xl mb-4">📡</div>
        <h1 className="text-2xl font-bold text-brand-900 mb-2">{t('title')}</h1>
        <p className="text-gray-500 text-sm leading-relaxed">{t('body')}</p>
      </div>
    </div>
  )
}
