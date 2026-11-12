/**
 * The canonical origin of the site, used for absolute URLs in metadata,
 * the sitemap and robots.txt. NEXT_PUBLIC_APP_URL wins so previews and local
 * runs describe themselves; production falls back to the one domain we own
 * (see .env.example).
 */
const FALLBACK = 'https://auntymel.app'

export function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (!raw) return FALLBACK
  try {
    return new URL(raw).origin
  } catch {
    return FALLBACK
  }
}

/** Pages that are public, stable and worth indexing. Everything else is private. */
export const PUBLIC_PATHS = [
  '/',
  '/waitlist',
  '/waitlist/partner',
  '/support',
  '/terms',
  '/privacy',
  '/cookies',
  '/data-deletion',
  '/accessibility',
] as const
