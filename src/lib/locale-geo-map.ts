export const SUPPORTED_LOCALES = ['en', 'fr', 'es', 'de', 'pt'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'en'

// ISO 3166-1 alpha-2 country -> primary app locale. Countries not listed
// fall back to DEFAULT_LOCALE.
const COUNTRY_TO_LOCALE: Record<string, Locale> = {
  FR: 'fr', BE: 'fr', MC: 'fr', LU: 'fr',
  ES: 'es', MX: 'es', AR: 'es', CO: 'es', CL: 'es', PE: 'es', VE: 'es',
  UY: 'es', EC: 'es', GT: 'es', CU: 'es', BO: 'es', DO: 'es', HN: 'es',
  PY: 'es', SV: 'es', NI: 'es', CR: 'es', PA: 'es',
  DE: 'de', AT: 'de', CH: 'de',
  PT: 'pt', BR: 'pt', AO: 'pt', MZ: 'pt',
}

export function isSupportedLocale(value: string | null | undefined): value is Locale {
  return !!value && (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

export function localeFromCountry(countryCode: string | null | undefined): Locale | null {
  if (!countryCode) return null
  return COUNTRY_TO_LOCALE[countryCode.toUpperCase()] ?? null
}

export function localeFromAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE
  const preferred = header
    .split(',')
    .map((part) => part.split(';')[0]?.trim().slice(0, 2).toLowerCase())

  for (const lang of preferred) {
    if (isSupportedLocale(lang)) return lang
  }
  return DEFAULT_LOCALE
}

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  fr: 'Français',
  es: 'Español',
  de: 'Deutsch',
  pt: 'Português',
}
