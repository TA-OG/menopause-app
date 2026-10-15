'use client'

import { useState } from 'react'
import { Check, Copy, KeyRound } from 'lucide-react'

interface SetupValue {
  name: string
  value: string
  secret: boolean
}

interface SetupResult {
  values: SetupValue[]
  kept: string[]
  webhookUrl: string
  error?: string
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
      className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
    >
      {copied ? <Check className="h-3 w-3" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

/**
 * One-time Cloudflare setup, from the live site. Shown while any setting
 * that Cloudflare must generate is missing from this deployment.
 */
export default function StreamSetupPanel({
  missing,
  canRun,
}: {
  /** Names (never values) of CLOUDFLARE_* settings this deployment lacks. */
  missing: string[]
  /** Account ID and API token are present, so setup can talk to Cloudflare. */
  canRun: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<SetupResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    if (
      !window.confirm(
        'This creates a signing key and connects Cloudflare to the app. ' +
          'You will be shown secret values ONCE to copy into Vercel. Continue?',
      )
    ) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/videos/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      })
      const body = (await res.json().catch(() => null)) as SetupResult | null
      if (body?.values?.length) setResult(body)
      if (!res.ok) setError(body?.error ?? `Setup failed (${res.status}).`)
      else if (body && !body.values.length) setResult(body)
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-white border border-amber-300 rounded-xl p-5 space-y-4">
      <div className="flex items-start gap-3">
        <KeyRound className="h-5 w-5 text-amber-600 mt-0.5" aria-hidden="true" />
        <div>
          <p className="font-medium text-brand-900">Video hosting is not fully set up</p>
          <p className="text-sm text-gray-600 mt-1">Missing in this deployment: {missing.join(', ')}</p>
        </div>
      </div>

      {!canRun ? (
        <p className="text-sm text-gray-700">
          First add <code className="bg-gray-100 px-1 rounded">CLOUDFLARE_ACCOUNT_ID</code> and{' '}
          <code className="bg-gray-100 px-1 rounded">CLOUDFLARE_STREAM_API_TOKEN</code> in Vercel → Settings →
          Environment Variables, then redeploy and come back here.
        </p>
      ) : !result ? (
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="rounded-lg bg-brand-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? 'Setting up…' : 'Set up video hosting'}
        </button>
      ) : null}

      {error && <p className="text-sm text-red-700">{error}</p>}

      {result && result.values.length > 0 && (
        <div className="space-y-3">
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800">
            <p className="font-medium">Copy these into Vercel now — they will not be shown again.</p>
            <ol className="list-decimal ml-5 mt-1 space-y-0.5">
              <li>Vercel → your project → Settings → Environment Variables.</li>
              <li>Add each one below, ticking <strong>Production</strong> and <strong>Preview</strong>.</li>
              <li>Deployments → latest → ⋯ → <strong>Redeploy</strong>.</li>
            </ol>
            <p className="mt-2">
              Don&apos;t press setup again before redeploying. If you do, use only the newest values.
            </p>
          </div>
          {result.values.map((v) => (
            <div key={v.name} className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <code className="text-xs font-semibold text-gray-800">{v.name}</code>
                <CopyButton text={v.value} />
              </div>
              <textarea
                readOnly
                value={v.value}
                rows={v.secret && v.value.length > 100 ? 4 : 1}
                className="w-full rounded-md border border-gray-300 bg-gray-50 px-2 py-1 font-mono text-xs"
                aria-label={v.name}
                onFocus={(e) => e.currentTarget.select()}
              />
            </div>
          ))}
          <p className="text-xs text-gray-500">Webhook points at {result.webhookUrl}</p>
        </div>
      )}

      {result && result.values.length === 0 && !error && (
        <p className="text-sm text-gray-700">
          Nothing new to create. If a setting is still listed as missing, add it in Vercel and redeploy.
        </p>
      )}
    </div>
  )
}
