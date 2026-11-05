'use client'

/**
 * Global error boundary — catches unhandled render errors anywhere in the app
 * (including the root layout). Two jobs:
 *   1. Report the crash to /api/monitoring so it shows in the admin dashboard.
 *   2. Show the user a calm fallback with a retry.
 *
 * Note: this only fires in production builds; in dev Next.js shows its own
 * error overlay instead.
 */

import { useEffect } from 'react'
import { isSupportedLocale, DEFAULT_LOCALE, type Locale } from '@/lib/locale-geo-map'

// This boundary REPLACES the root layout, so the next-intl provider is gone by
// the time it renders. It must stand alone: a tiny dictionary, read from the
// same NEXT_LOCALE cookie, typed so no language can be missing.
const COPY: Record<Locale, { title: string; body: string; retry: string }> = {
  en: {
    title: 'Something went wrong',
    body: 'Sorry — that wasn’t supposed to happen. The team has been notified. You can try again, and if it keeps happening please let us know.',
    retry: 'Try again',
  },
  fr: {
    title: 'Une erreur s’est produite',
    body: 'Désolées — cela n’aurait pas dû arriver. L’équipe a été prévenue. Vous pouvez réessayer, et si le problème persiste, dites-le-nous.',
    retry: 'Réessayer',
  },
  es: {
    title: 'Algo ha salido mal',
    body: 'Lo sentimos — esto no tenía que pasar. El equipo ya está avisado. Puedes volver a intentarlo y, si sigue pasando, cuéntanoslo.',
    retry: 'Intentar de nuevo',
  },
  de: {
    title: 'Etwas ist schiefgelaufen',
    body: 'Entschuldigung — das hätte nicht passieren sollen. Das Team wurde benachrichtigt. Du kannst es erneut versuchen, und wenn es wieder passiert, sag uns bitte Bescheid.',
    retry: 'Erneut versuchen',
  },
  pt: {
    title: 'Algo correu mal',
    body: 'Lamentamos — isto não devia ter acontecido. A equipa já foi avisada. Pode tentar novamente e, se continuar a acontecer, diga-nos.',
    retry: 'Tentar novamente',
  },
}

function currentLocale(): Locale {
  if (typeof document === 'undefined') return DEFAULT_LOCALE
  const value = document.cookie
    .split('; ')
    .find((c) => c.startsWith('NEXT_LOCALE='))
    ?.split('=')[1]
  return isSupportedLocale(value) ? value : DEFAULT_LOCALE
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const locale = currentLocale()
  const copy = COPY[locale]
  useEffect(() => {
    try {
      fetch('/api/monitoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: error.message,
          stack: error.stack,
          digest: error.digest,
          route: typeof window !== 'undefined' ? window.location.pathname : null,
        }),
        keepalive: true, // still sends if the page is being torn down
      }).catch(() => {})
    } catch {
      // Reporting is best-effort — never let it block the fallback UI.
    }
  }, [error])

  return (
    <html lang={locale}>
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#faf7f5' }}>
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
          }}
        >
          <div
            style={{
              maxWidth: 420,
              textAlign: 'center',
              background: '#fff',
              border: '1px solid #f0e9e4',
              borderRadius: 16,
              padding: '2rem',
            }}
          >
            <h1 style={{ fontSize: '1.25rem', margin: '0 0 0.5rem', color: '#4a2d3a' }}>
              {copy.title}
            </h1>
            <p style={{ fontSize: '0.9rem', color: '#7a6b72', margin: '0 0 1.5rem', lineHeight: 1.5 }}>
              {copy.body}
            </p>
            <button
              onClick={() => reset()}
              style={{
                background: '#4a2d3a',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                padding: '0.6rem 1.5rem',
                fontSize: '0.9rem',
                cursor: 'pointer',
              }}
            >
              {copy.retry}
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
