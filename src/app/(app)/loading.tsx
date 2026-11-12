import { getTranslations } from 'next-intl/server'

/**
 * Shown while any signed-in page streams in. A neutral skeleton (a title, then
 * a few cards) rather than a spinner, so the layout does not jump when the real
 * page arrives. Pages with a more specific shape add their own loading.tsx.
 */
export default async function AppLoading() {
  const t = await getTranslations('Loading')
  return (
    <div role="status" aria-busy="true" className="space-y-5 py-4">
      <span className="sr-only">{t('label')}</span>
      <div aria-hidden="true" className="space-y-2">
        <div className="h-8 w-48 animate-pulse rounded bg-gray-100" />
        <div className="h-4 w-64 max-w-full animate-pulse rounded bg-gray-100" />
      </div>
      <div aria-hidden="true" className="h-28 animate-pulse rounded-2xl bg-gray-100" />
      <div aria-hidden="true" className="h-28 animate-pulse rounded-2xl bg-gray-100" />
      <div aria-hidden="true" className="h-28 animate-pulse rounded-2xl bg-gray-100" />
    </div>
  )
}
