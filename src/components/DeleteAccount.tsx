'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  DELETE_CONFIRMATION,
  DELETE_ERROR_MESSAGE_KEY,
  isDeleteAccountErrorCode,
  isDeleteConfirmed,
} from '@/lib/account-deletion'

interface Props {
  /** A live Stripe subscription that deleting will cancel. */
  hasSubscription: boolean
}

const PRIVACY_EMAIL = 'privacy@auntymel.app'
const HELLO_EMAIL = 'hello@auntymel.app'

/**
 * Self-service account deletion on /profile (DELETE /api/account).
 *
 * Collapsed behind a plain link so it can't be hit by accident, and asks for
 * a typed confirmation because there is no undo: the account and all of its
 * data are gone the moment this succeeds. The confirmation word is the same
 * in every language because the server checks it literally.
 */
export default function DeleteAccount({ hasSubscription }: Props) {
  const t = useTranslations('DeleteAccount')
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
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        // The API's own message is English: show hers, keyed on its code.
        const code: unknown = data?.code
        const key = isDeleteAccountErrorCode(code) ? DELETE_ERROR_MESSAGE_KEY[code] : 'errorGeneric'
        setError(t(key, { email: PRIVACY_EMAIL }))
        setDeleting(false)
        return
      }
      setDeleted(true)
    } catch {
      setError(t('errorGeneric'))
      setDeleting(false)
    }
  }

  if (deleted) {
    return (
      <div role="status" className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 text-center">
        <p className="font-semibold text-gray-900">{t('deletedTitle')}</p>
        <p className="text-sm text-gray-500 mt-1">{t('deletedBody')}</p>
        <a href="/" className="inline-block mt-4 text-sm font-medium text-brand-700">
          {t('home')}
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
        {t('open')}
      </button>
    )
  }

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-red-200 space-y-3">
      <p className="font-semibold text-gray-900">{t('title')}</p>
      <ul className="text-sm text-gray-600 space-y-1 list-disc pl-5">
        <li>{t('pointData')}</li>
        {hasSubscription && <li>{t('pointSubscription')}</li>}
        <li>{t('pointFinal')}</li>
      </ul>
      {hasSubscription && (
        <p className="text-xs text-gray-500">{t('refundNote', { email: HELLO_EMAIL })}</p>
      )}
      <label htmlFor="delete-confirm" className="block text-sm text-gray-700">
        {t.rich('confirmLabel', {
          word: DELETE_CONFIRMATION,
          strong: (chunks) => <strong>{chunks}</strong>,
        })}
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
          {deleting ? t('deleting') : t('confirm')}
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
          {t('cancel')}
        </button>
      </div>
    </div>
  )
}
