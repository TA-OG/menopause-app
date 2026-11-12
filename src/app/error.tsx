'use client'

/**
 * Route-level error boundary. Unlike global-error.tsx (which replaces the root
 * layout and so has to stand alone), this renders inside it, so it keeps the
 * locale provider, fonts and styling. It reports the crash the same way, then
 * offers a retry.
 */

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations('Error')

  useEffect(() => {
    try {
      fetch('/api/monitoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: error.message,
          stack: error.stack,
          digest: error.digest,
          route: window.location.pathname,
        }),
        keepalive: true,
      }).catch(() => {})
    } catch {
      // Reporting is best-effort — it must never block the fallback UI.
    }
  }, [error])

  return (
    <main className="flex min-h-[60vh] items-center justify-center px-6 py-12">
      <div role="alert" className="w-full max-w-sm rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm">
        <h1 className="mb-2 text-xl font-bold text-brand-900">{t('title')}</h1>
        <p className="mb-6 text-base leading-relaxed text-gray-600">{t('body')}</p>
        <button
          onClick={() => reset()}
          className="rounded-2xl bg-brand-900 px-6 py-3 font-semibold text-white transition-colors hover:bg-brand-800"
        >
          {t('retry')}
        </button>
      </div>
    </main>
  )
}
