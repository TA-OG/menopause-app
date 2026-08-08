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

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
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
    <html lang="en">
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
              Something went wrong
            </h1>
            <p style={{ fontSize: '0.9rem', color: '#7a6b72', margin: '0 0 1.5rem', lineHeight: 1.5 }}>
              Sorry — that wasn&apos;t supposed to happen. The team has been notified. You can try
              again, and if it keeps happening please let us know.
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
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
