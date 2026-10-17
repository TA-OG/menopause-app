'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Lock } from 'lucide-react'
import { cn } from '@/lib/cn'

/**
 * A video from the library, by key.
 *
 *   <StreamVideo slug="welcome" />
 *
 * Asks /api/videos/[slug]/playback for a signed player URL and embeds
 * Cloudflare's player. Who may watch is set per video in /admin/videos; this
 * component only reflects the server's answer:
 *
 *   - allowed          → the player
 *   - sign in / premium → a gentle locked card with the right next step
 *   - missing, not ready yet, or misconfigured → renders nothing, so a slot
 *     that hasn't had its video uploaded yet never shows a broken box
 */

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; title: string; iframeUrl: string }
  | { kind: 'locked'; title: string; reason: 'sign_in_required' | 'premium_required' }
  | { kind: 'hidden' }

export default function StreamVideo({
  slug,
  className,
}: {
  slug: string
  className?: string
}) {
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    setState({ kind: 'loading' })

    fetch(`/api/videos/${encodeURIComponent(slug)}/playback`, { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json().catch(() => null)
        if (res.ok && body?.iframeUrl) {
          setState({ kind: 'ready', title: body.title, iframeUrl: body.iframeUrl })
        } else if (res.status === 403 && body?.reason) {
          setState({ kind: 'locked', title: body.title, reason: body.reason })
        } else {
          setState({ kind: 'hidden' })
        }
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') setState({ kind: 'hidden' })
      })

    return () => controller.abort()
  }, [slug])

  if (state.kind === 'hidden') return null

  return (
    <div
      className={cn(
        'relative w-full overflow-hidden rounded-2xl bg-brand-100 aspect-video',
        className,
      )}
    >
      {state.kind === 'loading' && (
        <div className="absolute inset-0 animate-pulse" aria-hidden="true" />
      )}

      {state.kind === 'ready' && (
        <iframe
          src={state.iframeUrl}
          title={state.title}
          className="absolute inset-0 h-full w-full border-0"
          allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          loading="lazy"
        />
      )}

      {state.kind === 'locked' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
          <Lock className="h-6 w-6 text-brand-700" aria-hidden="true" />
          <p className="font-medium text-brand-900">{state.title}</p>
          {state.reason === 'sign_in_required' ? (
            <Link
              href="/auth/sign-in"
              className="rounded-xl bg-brand-900 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800"
            >
              Sign in to watch
            </Link>
          ) : (
            <Link
              href="/pay"
              className="rounded-xl bg-brand-900 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800"
            >
              Available with Premium
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
