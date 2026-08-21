/**
 * Canonical public origin for absolute URLs (canonical tags, Open Graph,
 * sitemap, JSON-LD). Relative URLs are not valid in any of those places, so
 * every one of them has to agree on one origin.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_APP_URL || 'https://auntymel.app'
).replace(/\/+$/, '')

export const SITE_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Aunty Mel'

export function absoluteUrl(pathname: string): string {
  return `${SITE_URL}${pathname.startsWith('/') ? pathname : `/${pathname}`}`
}
