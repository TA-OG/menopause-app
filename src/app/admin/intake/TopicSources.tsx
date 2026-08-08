'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  INTAKE_BUCKET,
  ACCEPT_ATTR,
  ALLOWED_MIME,
  MAX_FILE_BYTES,
  isAllowedMime,
  type IntakeDocument,
  type IntakeReference,
} from '@/lib/intake-documents'

type UploadState = 'idle' | 'uploading' | 'error'

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Resolve a usable MIME type for a picked file. Browsers leave `type` empty for
 * some files (notably .md/.txt), so fall back to the extension → MIME map.
 */
function resolveMime(file: File): string | null {
  if (file.type && isAllowedMime(file.type)) return file.type
  const dot = file.name.lastIndexOf('.')
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : ''
  const match = Object.entries(ALLOWED_MIME).find(([, e]) => e === ext)
  return match ? match[0] : null
}

const emptyRef = {
  title: '',
  authors: '',
  publication: '',
  year: '',
  url: '',
  doi: '',
  notes: '',
}

/**
 * Per-topic source library: upload Pamela's studies/documents and record the
 * external citations that back her advice. Self-contained — it loads its own
 * data whenever the active topic changes, so the parent form's state is
 * untouched.
 */
export default function TopicSources({
  topicId,
  topicLabel,
}: {
  topicId: string
  topicLabel: string
}) {
  const supabase = useRef(createClient()).current

  const [docs, setDocs] = useState<IntakeDocument[]>([])
  const [refs, setRefs] = useState<IntakeReference[]>([])
  const [loading, setLoading] = useState(true)

  // Upload widget
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [sourceNote, setSourceNote] = useState('')
  const [brandingNote, setBrandingNote] = useState('')
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [uploadError, setUploadError] = useState('')

  // Reference form
  const [ref, setRef] = useState({ ...emptyRef })
  const [savingRef, setSavingRef] = useState(false)
  const [refError, setRefError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [d, r] = await Promise.all([
        fetch(`/api/admin/intake/documents?topicId=${encodeURIComponent(topicId)}`),
        fetch(`/api/admin/intake/references?topicId=${encodeURIComponent(topicId)}`),
      ])
      const dj = await d.json().catch(() => ({}))
      const rj = await r.json().catch(() => ({}))
      setDocs(d.ok ? (dj.data ?? []) : [])
      setRefs(r.ok ? (rj.data ?? []) : [])
    } finally {
      setLoading(false)
    }
  }, [topicId])

  // Reload whenever the active topic changes; reset transient form state.
  useEffect(() => {
    setFile(null)
    setSourceNote('')
    setBrandingNote('')
    setUploadState('idle')
    setUploadError('')
    setRef({ ...emptyRef })
    setRefError('')
    if (fileRef.current) fileRef.current.value = ''
    void load()
  }, [topicId, load])

  async function handleUpload() {
    if (!file) return
    setUploadState('uploading')
    setUploadError('')

    const mimeType = resolveMime(file)
    if (!mimeType) {
      setUploadState('error')
      setUploadError('Unsupported file type. Use PDF, Word, text, or an image.')
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      setUploadState('error')
      setUploadError('File is too large (max 25 MB).')
      return
    }

    try {
      // 1. Ask the server for a one-time signed upload URL.
      const signRes = await fetch('/api/admin/intake/documents/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mimeType, sizeBytes: file.size }),
      })
      const signJson = await signRes.json().catch(() => ({}))
      if (!signRes.ok) throw new Error(signJson.error ?? 'Could not start upload')

      // 2. Send the file straight to Storage (bypasses the API body limit).
      const { error: upErr } = await supabase.storage
        .from(INTAKE_BUCKET)
        .uploadToSignedUrl(signJson.path, signJson.token, file, {
          contentType: mimeType,
        })
      if (upErr) throw upErr

      // 3. Record the metadata row.
      const recRes = await fetch('/api/admin/intake/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: signJson.path,
          fileName: file.name,
          mimeType,
          sizeBytes: file.size,
          topicId,
          topicLabel,
          sourceNote,
          brandingNote,
        }),
      })
      const recJson = await recRes.json().catch(() => ({}))
      if (!recRes.ok) throw new Error(recJson.error ?? 'Could not save document')

      setDocs((prev) => [recJson.data, ...prev])
      setFile(null)
      setSourceNote('')
      setBrandingNote('')
      if (fileRef.current) fileRef.current.value = ''
      setUploadState('idle')
    } catch (err) {
      setUploadState('error')
      setUploadError((err as Error).message)
    }
  }

  async function download(id: string) {
    try {
      const res = await fetch(`/api/admin/intake/documents/${id}`)
      const json = await res.json().catch(() => ({}))
      if (res.ok && json.url) window.open(json.url, '_blank', 'noopener')
    } catch {
      /* surfaced as a no-op; admin can retry */
    }
  }

  async function deleteDoc(id: string) {
    if (!confirm('Delete this document? This removes the file permanently.')) return
    const res = await fetch(`/api/admin/intake/documents/${id}`, { method: 'DELETE' })
    if (res.ok) setDocs((prev) => prev.filter((d) => d.id !== id))
  }

  async function addReference() {
    if (!ref.title.trim()) {
      setRefError('A title is required.')
      return
    }
    setSavingRef(true)
    setRefError('')
    try {
      const res = await fetch('/api/admin/intake/references', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicId,
          title: ref.title,
          authors: ref.authors,
          publication: ref.publication,
          year: ref.year || undefined,
          url: ref.url || undefined,
          doi: ref.doi,
          notes: ref.notes,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? 'Could not save reference')
      setRefs((prev) => [json.data, ...prev])
      setRef({ ...emptyRef })
    } catch (err) {
      setRefError((err as Error).message)
    } finally {
      setSavingRef(false)
    }
  }

  async function deleteReference(id: string) {
    const res = await fetch(`/api/admin/intake/references/${id}`, { method: 'DELETE' })
    if (res.ok) setRefs((prev) => prev.filter((r) => r.id !== id))
  }

  const inputCls =
    'w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-300'

  return (
    <div className="pt-6 mt-2 border-t border-gray-100 space-y-8">
      {/* ── Documents ─────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div>
          <h4 className="text-sm font-bold text-brand-900">Source documents</h4>
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
            Upload Pamela’s studies, papers or notes for this topic. Files are kept
            private to the team — they’re never shown to users. If a file carries her
            company’s branding, note it below so it’s removed when the content is written up.
          </p>
        </div>

        <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 space-y-3">
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT_ATTR}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null)
              setUploadState('idle')
              setUploadError('')
            }}
            className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-900 file:text-white file:px-3 file:py-2 file:text-sm hover:file:bg-brand-800 file:cursor-pointer"
          />
          <textarea
            value={sourceNote}
            onChange={(e) => setSourceNote(e.target.value)}
            rows={2}
            placeholder="What is this, and where is it from? (optional)"
            className={`${inputCls} resize-y`}
          />
          <textarea
            value={brandingNote}
            onChange={(e) => setBrandingNote(e.target.value)}
            rows={2}
            placeholder="Any company branding / logos / names to remove? (optional)"
            className={`${inputCls} resize-y`}
          />
          <div className="flex items-center gap-3">
            <button
              onClick={() => void handleUpload()}
              disabled={!file || uploadState === 'uploading'}
              className="bg-brand-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-800 transition-colors disabled:opacity-50"
            >
              {uploadState === 'uploading' ? 'Uploading…' : 'Upload document'}
            </button>
            {uploadState === 'error' && (
              <span className="text-sm text-red-600">{uploadError || 'Upload failed'}</span>
            )}
          </div>
        </div>

        {/* Document list */}
        {loading ? (
          <p className="text-xs text-gray-400">Loading…</p>
        ) : docs.length === 0 ? (
          <p className="text-xs text-gray-400">No documents uploaded for this topic yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{d.file_name}</p>
                  <p className="text-xs text-gray-400">
                    {formatBytes(d.size_bytes)}
                    {d.branding_note ? ' · branding to remove' : ''}
                  </p>
                </div>
                <button
                  onClick={() => void download(d.id)}
                  className="text-xs text-brand-700 hover:text-brand-900 hover:underline"
                >
                  Download
                </button>
                <button
                  onClick={() => void deleteDoc(d.id)}
                  className="text-xs text-red-500 hover:text-red-700 hover:underline"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── References ────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div>
          <h4 className="text-sm font-bold text-brand-900">External references</h4>
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
            Record the studies and publications that back this advice. Keeping citations
            means the app stays an externally-verified information source.
          </p>
        </div>

        <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 space-y-3">
          <input
            value={ref.title}
            onChange={(e) => setRef((p) => ({ ...p, title: e.target.value }))}
            placeholder="Title *"
            className={inputCls}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              value={ref.authors}
              onChange={(e) => setRef((p) => ({ ...p, authors: e.target.value }))}
              placeholder="Authors"
              className={inputCls}
            />
            <input
              value={ref.publication}
              onChange={(e) => setRef((p) => ({ ...p, publication: e.target.value }))}
              placeholder="Journal / publisher"
              className={inputCls}
            />
            <input
              value={ref.year}
              onChange={(e) => setRef((p) => ({ ...p, year: e.target.value }))}
              placeholder="Year"
              inputMode="numeric"
              className={inputCls}
            />
            <input
              value={ref.doi}
              onChange={(e) => setRef((p) => ({ ...p, doi: e.target.value }))}
              placeholder="DOI"
              className={inputCls}
            />
          </div>
          <input
            value={ref.url}
            onChange={(e) => setRef((p) => ({ ...p, url: e.target.value }))}
            placeholder="URL (https://…)"
            className={inputCls}
          />
          <textarea
            value={ref.notes}
            onChange={(e) => setRef((p) => ({ ...p, notes: e.target.value }))}
            rows={2}
            placeholder="What claim does this support? (optional)"
            className={`${inputCls} resize-y`}
          />
          <div className="flex items-center gap-3">
            <button
              onClick={() => void addReference()}
              disabled={savingRef}
              className="bg-brand-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-800 transition-colors disabled:opacity-50"
            >
              {savingRef ? 'Saving…' : 'Add reference'}
            </button>
            {refError && <span className="text-sm text-red-600">{refError}</span>}
          </div>
        </div>

        {/* Reference list */}
        {!loading && refs.length > 0 && (
          <ul className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
            {refs.map((r) => (
              <li key={r.id} className="flex items-start gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{r.title}</p>
                  <p className="text-xs text-gray-400">
                    {[r.authors, r.publication, r.year].filter(Boolean).join(' · ')}
                  </p>
                  {r.url && (
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-brand-700 hover:underline break-all"
                    >
                      {r.url}
                    </a>
                  )}
                  {r.notes && <p className="text-xs text-gray-500 mt-0.5">{r.notes}</p>}
                </div>
                <button
                  onClick={() => void deleteReference(r.id)}
                  className="text-xs text-red-500 hover:text-red-700 hover:underline flex-shrink-0"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
