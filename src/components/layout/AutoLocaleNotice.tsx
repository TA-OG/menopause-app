import { cookies } from 'next/headers'
import { getLocale } from 'next-intl/server'
import { isSupportedLocale } from '@/lib/locale-geo-map'
import AutoLocaleBanner from './AutoLocaleBanner'

// Server-side gate: only render the (client) banner when middleware just
// auto-detected the locale from geo/Accept-Language for this browser and
// hasn't shown it yet. The marker cookie is cleared by /api/locale as soon
// as the visitor acts on the banner or explicitly changes language, so this
// only ever fires once per auto-detection event.
export default async function AutoLocaleNotice() {
  const autoCookie = cookies().get('NEXT_LOCALE_AUTO')?.value
  if (autoCookie !== '1') return null

  const locale = await getLocale()
  if (!isSupportedLocale(locale) || locale === 'en') return null

  return <AutoLocaleBanner locale={locale} />
}
