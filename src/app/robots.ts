import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/site'

// Only the public marketing and legal pages are meant to be found. The signed-in
// app, the admin area and the API hold personal or health data and are kept out.
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl()
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/admin',
          '/auth/',
          '/onboarding',
          '/dashboard',
          '/my-plan',
          '/symptom-checkin',
          '/journal',
          '/learn',
          '/profile',
          '/pay',
          '/refer',
          '/offline',
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  }
}
