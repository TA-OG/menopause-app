'use client'

import { useState } from 'react'
import { DELETE_CONFIRMATION, isDeleteConfirmed } from '@/lib/account-deletion'

interface Props {
  /** A live Stripe subscription that deleting will cancel. */
  hasSubscription: boolean
}

/**
 * Self-service account deletion on /profile (DELETE /api/account).
 *
 * Collapsed behind a plain link so it can't be hit by accident, and asks for
 * a typed confirmation because there is no undo: the account and all of its
 * data are gone the moment this succeeds.
 */
export default function DeleteAccount({ hasSubscription }: Props) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleted, setDeleted] = useState(false)

  async function handleDelete() {
    setError(null)
    setDeleting(true)
    try {
      const res = await fetch('/api/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: DELETE_CONFIRMATION }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? 'Something went wrong. Please try again.')
      setDeleted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setDeleting(false)
    }
  }

  if (deleted) {
    return (
      <div role="status" className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 text-center">
        <p className="font-semibold text-gray-900">Your account has been deleted</p>
        <p className="text-sm text-gray-500 mt-1">
          All of your data has been removed. Thank you for spending time with Aunty Mel.
        </p>
        <a href="/" className="inline-block mt-4 text-sm font-medium text-brand-700">
          Back to the home page
        </a>
      </div>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full text-red-600 text-sm py-2 hover:text-red-700 transition-colors"
      >
        Delete my account
      </button>
    )
  }

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-red-200 space-y-3">
      <p className="font-semibold text-gray-900">Delete your account?</p>
      <ul className="text-sm text-gray-600 space-y-1 list-disc pl-5">
        <li>Your account, check-ins, journal, plan and settings are deleted straight away.</li>
        {hasSubscription && (
          <li>Your subscription is cancelled now and you won&apos;t be charged again.</li>
        )}
        <li>This can&apos;t be undone.</li>
      </ul>
      {hasSubscription && (
        <p className="text-xs text-gray-500">
          Deleting doesn&apos;t refund your current payment. If you&apos;re within our 30-day
          money-back guarantee, email hello@auntymel.app.
        </p>
      )}
      <label htmlFor="delete-confirm" className="block text-sm text-gray-700">
        Type <strong>{DELETE_CONFIRMATION}</strong> to confirm
      </label>
      <input
        id="delete-confirm"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        autoComplete="off"
        autoCapitalize="characters"
        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
      />
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleDelete}
          disabled={!isDeleteConfirmed(typed) || deleting}
          className="flex-1 bg-red-600 text-white font-semibold py-2 rounded-xl text-sm hover:bg-red-700 disabled:opacity-40"
        >
          {deleting ? 'Deleting…' : 'Delete my account'}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setTyped('')
            setError(null)
          }}
          disabled={deleting}
          className="flex-1 border border-gray-200 text-gray-700 font-medium py-2 rounded-xl text-sm hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
