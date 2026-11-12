import type { MetadataRoute } from 'next'
import { PUBLIC_PATHS, siteUrl } from '@/lib/site'

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl()
  return PUBLIC_PATHS.map((path) => ({
    url: `${base}${path === '/' ? '' : path}`,
    changeFrequency: path === '/' ? 'weekly' : 'monthly',
    priority: path === '/' ? 1 : path.startsWith('/waitlist') ? 0.8 : 0.4,
  }))
}
