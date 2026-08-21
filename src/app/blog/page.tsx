import type { Metadata } from 'next'
import Link from 'next/link'
import Logo from '@/components/ui/Logo'
import { getAllPosts } from '@/lib/blog'
import { absoluteUrl, SITE_NAME } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Menopause journal',
  description:
    'Clear, sourced writing on menopause and perimenopause — what the evidence says, what the headlines got wrong, and what to actually do about your symptoms.',
  alternates: { canonical: absoluteUrl('/blog') },
  openGraph: {
    type: 'website',
    title: `Menopause journal | ${SITE_NAME}`,
    description:
      'Clear, sourced writing on menopause and perimenopause — what the evidence says, and what to actually do about your symptoms.',
    url: absoluteUrl('/blog'),
    siteName: SITE_NAME,
    locale: 'en_GB',
  },
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export default function BlogIndexPage() {
  const posts = getAllPosts()

  return (
    <main className="min-h-screen bg-gradient-to-b from-cream to-white">
      <nav className="flex items-center justify-between px-6 py-4 max-w-3xl mx-auto">
        <Link href="/" aria-label={`${SITE_NAME} home`}>
          <Logo size="sm" />
        </Link>
        <Link
          href="/waitlist"
          className="bg-brand-900 text-white font-medium px-4 py-2 rounded-xl hover:bg-brand-800 transition-colors"
        >
          Join the waitlist
        </Link>
      </nav>

      <div className="max-w-3xl mx-auto px-6 pb-20 pt-6">
        <header className="mb-10">
          <h1 className="text-3xl font-bold text-brand-900">Menopause journal</h1>
          <p className="text-gray-700 mt-3 leading-relaxed">
            Clear, sourced writing on menopause and perimenopause — what the evidence
            actually says, what the headlines got wrong, and what to do about your
            symptoms. Everything here cites where it came from.
          </p>
        </header>

        {posts.length === 0 ? (
          <p className="text-gray-400 text-sm">New writing coming soon.</p>
        ) : (
          <ul className="space-y-4">
            {posts.map((post) => (
              <li key={post.slug}>
                <Link
                  href={`/blog/${post.slug}`}
                  className="block bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:border-brand-200 transition-colors"
                >
                  <span className="text-xs text-brand-600 font-medium bg-brand-50 px-2 py-0.5 rounded-full">
                    {post.category}
                  </span>
                  <h2 className="font-semibold text-brand-900 mt-3 leading-snug text-lg">
                    {post.title}
                  </h2>
                  <p className="text-gray-600 text-sm mt-2 leading-relaxed">
                    {post.description}
                  </p>
                  <p className="text-xs text-gray-400 mt-3">
                    <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
                    {' · '}
                    {post.readMinutes} min read
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
