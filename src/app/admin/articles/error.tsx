'use client'

import { useEffect } from 'react'

/**
 * Error boundary for the article screens.
 *
 * The message is deliberately plain and does not show the underlying error:
 * Pamela cannot act on a Postgres message, and the detail is already in the
 * server logs. What she needs is to know nothing she published has changed,
 * and a way to try again.
 */
export default function ArticlesError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Article screen failed', { message: error.message, digest: error.digest })
  }, [error])

  return (
    <div className="bg-white rounded-2xl border border-red-200 shadow-sm p-6 max-w-xl">
      <h2 className="text-base font-semibold text-red-800">
        Something went wrong loading this page
      </h2>
      <p className="text-sm text-gray-600 mt-2">
        Nothing has been changed or published. Try again, and if it keeps happening
        let the team know{error.digest ? ` and quote reference ${error.digest}` : ''}.
      </p>
      <div className="flex gap-3 mt-4">
        <button
          type="button"
          onClick={reset}
          className="text-sm bg-brand-900 text-white px-4 py-2 rounded-xl hover:bg-brand-800"
        >
          Try again
        </button>
        <a
          href="/admin/articles"
          className="text-sm bg-white border border-gray-300 text-gray-800 px-4 py-2 rounded-xl hover:border-brand-400"
        >
          Back to articles
        </a>
      </div>
    </div>
  )
}
