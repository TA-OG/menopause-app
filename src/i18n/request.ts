import { getRequestConfig } from 'next-intl/server'
import { cookies, headers } from 'next/headers'
import {
  DEFAULT_LOCALE,
  isSupportedLocale,
  localeFromAcceptLanguage,
} from '@/lib/locale-geo-map'

// Mirrors middleware.ts's resolution order but without the geo/IP step —
// by the time a server component renders, middleware has already set the
// NEXT_LOCALE cookie for first-time visitors, so this only needs cookie ->
// Accept-Language -> default.
export default getRequestConfig(async () => {
  const cookieLocale = cookies().get('NEXT_LOCALE')?.value
  const locale = isSupportedLocale(cookieLocale)
    ? cookieLocale
    : localeFromAcceptLanguage(headers().get('accept-language')) ?? DEFAULT_LOCALE

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  }
})
