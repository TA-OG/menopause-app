import { pageTitle } from '@/lib/page-meta'
import { WifiOff } from 'lucide-react'
import IconBadge from '@/components/ui/IconBadge'
import { getTranslations } from 'next-intl/server'

export async function generateMetadata() {
  return pageTitle('Offline', 'title', { noindex: true })
}

export default async function OfflinePage() {
  const t = await getTranslations('Offline')
  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-brand-50">
      <div className="text-center max-w-sm">
        <IconBadge icon={WifiOff} />
        <h1 className="text-2xl font-bold text-brand-900 mb-2">{t('title')}</h1>
        <p className="text-gray-500 text-sm leading-relaxed">{t('body')}</p>
      </div>
    </div>
  )
}
