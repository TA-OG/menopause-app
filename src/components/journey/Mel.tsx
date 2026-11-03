'use client'

/**
 * Mel speaking, and the pieces every journey screen shares.
 *
 * Mel is the guide and the brand: she is shown with the Aunty Mel mark, never
 * with Pamela's photo. Pamela appears only in her own videos, labelled
 * "From Pamela" (decision of 13–14 Oct 2026).
 */

import Logo from '@/components/ui/Logo'
import StreamVideo from '@/components/video/StreamVideo'

export function MelSays({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        <Logo size="sm" />
      </div>
      <div className="rounded-2xl border border-brand-100 bg-white p-5 text-[15px] leading-relaxed text-brand-900 shadow-sm">
        {children}
      </div>
    </div>
  )
}

export function Choice({
  label,
  onClick,
  primary = false,
  disabled = false,
}: {
  label: string
  onClick: () => void
  primary?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        primary
          ? 'w-full rounded-2xl bg-brand-900 py-3 font-semibold text-white transition-colors hover:bg-brand-800 disabled:opacity-40'
          : 'w-full rounded-2xl border border-gray-200 bg-white py-3 text-sm font-medium text-gray-700 transition-colors hover:border-brand-300 hover:bg-brand-50 disabled:opacity-40'
      }
    >
      {label}
    </button>
  )
}

/** One of Pamela's approved clips. Renders nothing until the clip is uploaded. */
export function FromPamela({ slug }: { slug: string }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">From Pamela</p>
      <StreamVideo slug={slug} />
    </div>
  )
}

export function ErrorNote({ message }: { message: string }) {
  if (!message) return null
  return <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">{message}</p>
}

/** Her local calendar date, as the focus routes expect. */
export { localCalendarDate } from '@/lib/checkin-schema'
