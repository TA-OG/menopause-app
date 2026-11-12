import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { getLocale, getTranslations } from 'next-intl/server'
import { isSupportedLocale, DEFAULT_LOCALE, LOCALE_LABELS } from '@/lib/locale-geo-map'
import { legalText, type LegalDoc } from '@/content/legal'

/**
 * A legal or policy document, in the reader's language.
 *
 * Translations are provided for convenience; the English version is the one
 * that binds. Every translated view says so at the top, in the reader's own
 * language, with a one-tap link to the English text (?lang=en) — and the
 * English view links back. The banner is not optional: a translation with no
 * notice could be read as a separate, equally binding version.
 */

const FOOTER_LINKS: Record<LegalDoc, { href: string; key: string }[]> = {
  privacy: [{ href: '/terms', key: 'terms' }, { href: '/cookies', key: 'cookies' }],
  terms: [{ href: '/privacy', key: 'privacy' }, { href: '/cookies', key: 'cookies' }],
  cookies: [{ href: '/privacy', key: 'privacy' }, { href: '/terms', key: 'terms' }],
  dataDeletion: [{ href: '/privacy', key: 'privacy' }, { href: '/support', key: 'support' }],
  accessibility: [{ href: '/support', key: 'support' }, { href: '/privacy', key: 'privacy' }],
}

/**
 * In-page anchors other screens link to (e.g. /terms#referrals from the
 * referral card), keyed by section NUMBER — the one thing every translation
 * shares — so the link survives a heading being translated.
 */
const ANCHORS: Partial<Record<LegalDoc, Record<string, string>>> = {
  terms: { '5': 'referrals' },
}

function textOf(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (node && typeof node === 'object' && 'props' in node) {
    return textOf((node as { props: { children?: React.ReactNode } }).props.children)
  }
  return ''
}

const PATH: Record<LegalDoc, string> = {
  privacy: '/privacy',
  terms: '/terms',
  cookies: '/cookies',
  dataDeletion: '/data-deletion',
  accessibility: '/accessibility',
}

export default async function LegalDocument({
  doc,
  searchParams,
}: {
  doc: LegalDoc
  searchParams?: { lang?: string }
}) {
  const t = await getTranslations('Legal')
  const raw = await getLocale()
  const appLocale = isSupportedLocale(raw) ? raw : DEFAULT_LOCALE
  // ?lang=en shows the binding English text without changing her app language.
  const showEnglish = searchParams?.lang === 'en'
  const locale = showEnglish ? 'en' : appLocale
  const markdown = legalText(doc, locale)

  return (
    <main className="min-h-screen bg-cream" lang={locale}>
      <div className="max-w-2xl mx-auto px-6 py-12">
        <Link href="/" className="text-brand-700 text-sm font-medium hover:underline">
          {t('back')}
        </Link>

        {locale !== 'en' && (
          <div role="note" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p>{t('translationNotice')}</p>
            <Link href={`${PATH[doc]}?lang=en`} className="mt-1 inline-block font-semibold underline">
              {t('readEnglish')}
            </Link>
          </div>
        )}
        {showEnglish && appLocale !== 'en' && (
          <div role="note" className="mt-4 rounded-xl border border-brand-100 bg-white p-4 text-sm text-gray-700">
            <p>{t('englishShown')}</p>
            <Link href={PATH[doc]} className="mt-1 inline-block font-semibold text-brand-700 underline">
              {t('backToTranslation', { language: LOCALE_LABELS[appLocale] })}
            </Link>
          </div>
        )}

        <article className="mt-4">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children }) => (
                <h1 className="text-3xl font-bold text-brand-900 mt-4 mb-2">{children}</h1>
              ),
              h2: ({ children }) => {
                const number = textOf(children).match(/^(\d+)\./)?.[1]
                const id = number ? ANCHORS[doc]?.[number] : undefined
                return (
                  <h2 id={id} className="text-xl font-bold text-brand-900 mt-10 mb-3 scroll-mt-20">
                    {children}
                  </h2>
                )
              },
              h3: ({ children }) => <h3 className="font-semibold text-gray-900 mt-4 mb-1.5">{children}</h3>,
              p: ({ children }) => <p className="text-gray-700 leading-relaxed text-sm mb-3">{children}</p>,
              ul: ({ children }) => <ul className="list-disc pl-5 space-y-1.5 text-sm text-gray-700 mb-3">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700 mb-3">{children}</ol>,
              li: ({ children }) => <li className="leading-relaxed">{children}</li>,
              a: ({ href, children }) => {
                const external = href?.startsWith('http')
                return (
                  <a
                    href={href}
                    className="text-brand-700 underline"
                    {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  >
                    {children}
                  </a>
                )
              },
              blockquote: ({ children }) => (
                <div className="bg-white rounded-2xl p-6 border border-brand-100 my-8 [&_p]:mb-2 [&_h3]:mt-3">
                  {children}
                </div>
              ),
              table: ({ children }) => (
                <div className="overflow-x-auto my-3">
                  <table className="w-full text-xs border-collapse">{children}</table>
                </div>
              ),
              th: ({ children }) => (
                <th className="text-left p-2 font-semibold text-brand-900 border border-brand-100 bg-brand-50">
                  {children}
                </th>
              ),
              td: ({ children }) => <td className="p-2 border border-gray-100 text-gray-700">{children}</td>,
            }}
          >
            {markdown}
          </ReactMarkdown>
        </article>

        <div className="border-t border-gray-200 pt-6 mt-10 flex flex-wrap gap-4 text-sm">
          {FOOTER_LINKS[doc].map((l) => (
            <Link key={l.href} href={l.href} className="text-brand-700 hover:underline">
              {t(`links.${l.key}`)}
            </Link>
          ))}
          <Link href="/" className="text-gray-600 hover:underline">
            {t('backPlain')}
          </Link>
        </div>
      </div>
    </main>
  )
}
