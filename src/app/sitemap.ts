import type { MetadataRoute } from 'next'
import { getAllPosts } from '@/lib/blog'
import { absoluteUrl } from '@/lib/site'

/**
 * Only publicly reachable, indexable pages belong here. Authenticated routes
 * (/dashboard, /my-plan, /learn, …) are deliberately excluded — they redirect to
 * sign-in, and listing them wastes crawl budget on soft redirects.
 */
const STATIC_PATHS = [
  { path: '/', priority: 1, changeFrequency: 'monthly' as const },
  { path: '/waitlist', priority: 0.9, changeFrequency: 'monthly' as const },
  { path: '/blog', priority: 0.8, changeFrequency: 'weekly' as const },
  { path: '/privacy', priority: 0.3, changeFrequency: 'yearly' as const },
  { path: '/terms', priority: 0.3, changeFrequency: 'yearly' as const },
  { path: '/cookies', priority: 0.3, changeFrequency: 'yearly' as const },
  { path: '/accessibility', priority: 0.3, changeFrequency: 'yearly' as const },
  { path: '/support', priority: 0.3, changeFrequency: 'yearly' as const },
]

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  const staticEntries = STATIC_PATHS.map((entry) => ({
    url: absoluteUrl(entry.path),
    lastModified: now,
    changeFrequency: entry.changeFrequency,
    priority: entry.priority,
  }))

  const postEntries = getAllPosts().map((post) => ({
    url: absoluteUrl(`/blog/${post.slug}`),
    lastModified: new Date(`${post.updatedAt ?? post.publishedAt}T00:00:00Z`),
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }))

  return [...staticEntries, ...postEntries]
}
