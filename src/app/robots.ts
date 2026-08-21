import type { MetadataRoute } from 'next'
import { absoluteUrl } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Everything behind auth or tied to an individual account. Crawlers only
        // ever get a sign-in redirect from these, and some carry personal data.
        disallow: [
          '/api/',
          '/admin',
          '/dashboard',
          '/my-plan',
          '/symptom-checkin',
          '/journal',
          '/learn',
          '/profile',
          '/pay',
          '/onboarding',
          '/refer',
          '/auth/',
        ],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
    host: absoluteUrl('/'),
  }
}
