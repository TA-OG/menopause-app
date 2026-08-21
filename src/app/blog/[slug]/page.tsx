import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import Logo from '@/components/ui/Logo'
import { getAllPosts, getPostBySlug, type BlogPost } from '@/lib/blog'
import { absoluteUrl, SITE_NAME } from '@/lib/site'
import { DISCLAIMER } from '@/lib/disclaimer'

export function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }))
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const post = getPostBySlug(params.slug)
  if (!post) return {}

  const url = absoluteUrl(`/blog/${post.slug}`)
  return {
    title: post.title,
    description: post.description,
    keywords: post.keywords,
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      title: post.title,
      description: post.description,
      url,
      siteName: SITE_NAME,
      locale: 'en_GB',
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt ?? post.publishedAt,
      authors: [post.author],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
    },
  }
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * BlogPosting + FAQPage structured data.
 *
 * This is what search engines and answer engines read to decide whether the page
 * is a trustworthy source for a question. `citation` matters more than usual
 * here: the whole point of the post is that its claims are checkable.
 */
function buildJsonLd(post: BlogPost) {
  const url = absoluteUrl(`/blog/${post.slug}`)

  const blogPosting = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt ?? post.publishedAt,
    author: { '@type': 'Organization', name: post.author, url: absoluteUrl('/') },
    publisher: { '@type': 'Organization', name: SITE_NAME, url: absoluteUrl('/') },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    url,
    inLanguage: 'en-GB',
    keywords: post.keywords.join(', '),
    articleSection: post.category,
    citation: post.sources.map((s) => ({
      '@type': 'CreativeWork',
      name: s.title,
      publisher: { '@type': 'Organization', name: s.publisher },
      url: s.url,
    })),
  }

  const faqPage =
    post.faqs.length > 0
      ? {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: post.faqs.map((f) => ({
            '@type': 'Question',
            name: f.question,
            acceptedAnswer: { '@type': 'Answer', text: f.answer },
          })),
        }
      : null

  return faqPage ? [blogPosting, faqPage] : [blogPosting]
}

export default function BlogPostPage({ params }: { params: { slug: string } }) {
  const post = getPostBySlug(params.slug)
  if (!post) notFound()

  return (
    <main className="min-h-screen bg-gradient-to-b from-cream to-white">
      <script
        type="application/ld+json"
        // Structured data is built from our own vetted frontmatter, not user input.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildJsonLd(post)) }}
      />

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

      <article className="max-w-3xl mx-auto px-6 pb-20 pt-6">
        <Link href="/blog" className="text-sm text-brand-600 font-medium">
          ← All articles
        </Link>

        <header className="mt-5 mb-8">
          <span className="text-xs text-brand-600 font-medium bg-brand-50 px-2 py-0.5 rounded-full">
            {post.category}
          </span>
          <h1 className="text-3xl font-bold text-brand-900 mt-4 leading-tight">
            {post.title}
          </h1>
          <p className="text-sm text-gray-400 mt-3">
            By {post.author} ·{' '}
            <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
            {post.updatedAt && (
              <>
                {' · Updated '}
                <time dateTime={post.updatedAt}>{formatDate(post.updatedAt)}</time>
              </>
            )}
            {' · '}
            {post.readMinutes} min read
          </p>
        </header>

        <div className="prose prose-brand max-w-none prose-headings:text-brand-900 prose-a:text-brand-600 prose-strong:text-brand-900">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.body}</ReactMarkdown>
        </div>

        {post.faqs.length > 0 && (
          <section className="mt-12" aria-labelledby="faq-heading">
            <h2 id="faq-heading" className="text-2xl font-bold text-brand-900">
              Frequently asked questions
            </h2>
            <dl className="mt-5 space-y-5">
              {post.faqs.map((faq) => (
                <div
                  key={faq.question}
                  className="bg-white rounded-2xl p-5 border border-gray-100"
                >
                  <dt className="font-semibold text-brand-900">{faq.question}</dt>
                  <dd className="text-gray-700 mt-2 leading-relaxed">{faq.answer}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <section className="mt-12" aria-labelledby="sources-heading">
          <h2 id="sources-heading" className="text-2xl font-bold text-brand-900">
            Sources
          </h2>
          <ol className="mt-4 space-y-3 list-decimal list-inside">
            {post.sources.map((source) => (
              <li key={source.url} className="text-sm text-gray-700 leading-relaxed">
                <a
                  href={source.url}
                  className="text-brand-600 underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {source.title}
                </a>
                {' — '}
                {source.publisher}. Accessed {source.accessed}.
              </li>
            ))}
          </ol>
        </section>

        {/* Rendered structurally, not authored per-post, so a post can never ship without it. */}
        <aside className="mt-12 bg-brand-50 border border-brand-200 rounded-2xl p-5">
          <p className="font-semibold text-brand-900">Important</p>
          <p className="text-brand-900 text-sm mt-2 leading-relaxed">{DISCLAIMER.full}</p>
          <p className="text-brand-900 text-sm mt-3 leading-relaxed">
            {DISCLAIMER.gpSignpost}
          </p>
        </aside>

        <aside className="mt-6 bg-white border border-gray-100 rounded-2xl p-5">
          <p className="font-semibold text-brand-900">
            Want a plan built around your symptoms?
          </p>
          <p className="text-gray-700 text-sm mt-2 leading-relaxed">
            Aunty Mel turns what you are actually experiencing into a personalised
            nutrition, movement, sleep and stress plan — and helps you walk into your
            next GP appointment with the full picture.
          </p>
          <Link
            href="/waitlist"
            className="inline-block mt-4 bg-brand-900 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-brand-800 transition-colors"
          >
            Join the waitlist →
          </Link>
        </aside>
      </article>
    </main>
  )
}
