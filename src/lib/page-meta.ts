import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

/** Keeps a page out of search results. Applied to everything behind a login. */
export const NO_INDEX: Metadata['robots'] = { index: false, follow: false }

/**
 * A page title taken from the page's own messages, in the reader's language.
 * The root layout's template turns it into "<title> | Aunty Mel".
 * `namespace` and `key` are plain strings so one helper serves every route.
 */
export async function pageTitle(
  namespace: string,
  key = 'title',
  opts: { noindex?: boolean } = {}
): Promise<Metadata> {
  const t = await getTranslations(namespace)
  return {
    title: t(key),
    ...(opts.noindex ? { robots: NO_INDEX } : {}),
  }
}
