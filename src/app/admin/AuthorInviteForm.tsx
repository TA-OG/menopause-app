'use client'

import { useState } from 'react'

export default function AuthorInviteForm() {
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function invite() {
    if (!email.trim()) return
    setState('loading')
    setMessage('')
    try {
      const res = await fetch('/api/admin/invite-author', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), fullName: fullName.trim() || undefined }),
      })
      const json = await res.json()
      if (res.ok) {
        setState('done')
        setMessage(
          json.alreadyRegistered
            ? `${email} already had an account — granted author access. They can open /admin/intake now.`
            : `Invite sent to ${email}. Their email link opens the questionnaire directly.`,
        )
      } else {
        setState('error')
        setMessage(json.error ?? 'Failed')
      }
    } catch {
      setState('error')
      setMessage('Network error')
    }
  }

  return (
    <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
      <p className="text-xs font-medium text-gray-700">Invite a content author</p>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Name (optional)"
          className="sm:w-40 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-300"
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && invite()}
          placeholder="author@email.com"
          className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-300"
        />
        <button
          onClick={invite}
          disabled={state === 'loading'}
          className="text-sm bg-brand-900 text-white px-4 py-2 rounded-lg hover:bg-brand-800 transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          {state === 'loading' ? 'Inviting…' : 'Invite author'}
        </button>
      </div>
      {message && (
        <p className={`text-xs ${state === 'error' ? 'text-red-600' : 'text-green-600'}`}>
          {message}
        </p>
      )}
    </div>
  )
}
