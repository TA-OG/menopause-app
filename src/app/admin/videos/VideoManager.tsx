'use client'

import { useState } from 'react'
import { Film, RefreshCw, Upload } from 'lucide-react'
import {
  DIRECT_UPLOAD_MAX_BYTES,
  VIDEO_ACCESS_LABELS,
  VIDEO_ACCESS_LEVELS,
  type VideoAccess,
  type VideoRow,
  type VideoStatus,
} from '@/lib/stream-shared'

const STATUS_LABELS: Record<VideoStatus, string> = {
  awaiting_upload: 'Waiting for upload',
  processing: 'Processing — not playable yet',
  ready: 'Ready',
  error: 'Failed',
}

const STATUS_STYLES: Record<VideoStatus, string> = {
  awaiting_upload: 'bg-gray-100 text-gray-700',
  processing: 'bg-amber-100 text-amber-800',
  ready: 'bg-green-100 text-green-800',
  error: 'bg-red-100 text-red-700',
}

async function readError(res: Response): Promise<string> {
  const body = await res.json().catch(() => null)
  return body?.error ?? `Request failed (${res.status})`
}

/** XHR rather than fetch, because fetch can't report upload progress. */
function uploadFile(url: string, file: File, onProgress: (_percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Cloudflare rejected the upload (${xhr.status}).`))
    xhr.onerror = () => reject(new Error('The upload failed — check your connection and try again.'))
    const form = new FormData()
    form.append('file', file)
    xhr.send(form)
  })
}

export default function VideoManager({ initialVideos }: { initialVideos: VideoRow[] }) {
  const [videos, setVideos] = useState(initialVideos)
  const [mode, setMode] = useState<'upload' | 'link'>('upload')
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [access, setAccess] = useState<VideoAccess>('premium')
  const [maxMinutes, setMaxMinutes] = useState(15)
  const [file, setFile] = useState<File | null>(null)
  const [streamUid, setStreamUid] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [message, setMessage] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null)

  function upsert(video: VideoRow) {
    setVideos((prev) => [video, ...prev.filter((v) => v.id !== video.id)])
  }

  async function refresh(id: string) {
    const res = await fetch(`/api/admin/videos/${id}`, { method: 'POST' })
    if (res.ok) upsert((await res.json()).video)
    else setMessage({ tone: 'error', text: await readError(res) })
  }

  async function update(id: string, patch: Partial<Pick<VideoRow, 'access' | 'title' | 'slug'>>) {
    const res = await fetch(`/api/admin/videos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (res.ok) upsert((await res.json()).video)
    else setMessage({ tone: 'error', text: await readError(res) })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)

    if (mode === 'upload') {
      if (!file) return setMessage({ tone: 'error', text: 'Choose a video file first.' })
      if (file.size > DIRECT_UPLOAD_MAX_BYTES) {
        return setMessage({
          tone: 'error',
          text:
            'This file is over 200 MB, which is the most that can be uploaded from here. ' +
            'Upload it in the Cloudflare dashboard (Stream → Videos), then use "Link an existing video".',
        })
      }
    }

    setBusy(true)
    try {
      const res = await fetch('/api/admin/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          mode === 'upload'
            ? { mode, title, slug, access, maxDurationMinutes: maxMinutes }
            : { mode, title, slug, access, stream_uid: streamUid },
        ),
      })
      if (!res.ok) throw new Error(await readError(res))
      const { video, uploadURL } = (await res.json()) as { video: VideoRow; uploadURL: string | null }
      upsert(video)

      if (mode === 'upload' && file && uploadURL) {
        setProgress(0)
        await uploadFile(uploadURL, file, setProgress)
        setProgress(null)
        await refresh(video.id)
        setMessage({
          tone: 'ok',
          text: 'Uploaded. Cloudflare is now processing it — it becomes playable when the status says Ready.',
        })
      } else {
        setMessage({ tone: 'ok', text: 'Linked.' })
      }

      setTitle('')
      setSlug('')
      setFile(null)
      setStreamUid('')
    } catch (err) {
      setProgress(null)
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Something went wrong.' })
    } finally {
      setBusy(false)
    }
  }

  const input = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm'

  return (
    <div className="space-y-8">
      <form onSubmit={submit} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div className="flex gap-2 text-sm">
          {(['upload', 'link'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 rounded-lg ${mode === m ? 'bg-brand-900 text-white' : 'bg-gray-100 text-gray-700'}`}
            >
              {m === 'upload' ? 'Upload a video (up to 200 MB)' : 'Link an existing video'}
            </button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm space-y-1">
            <span className="font-medium text-gray-700">Title</span>
            <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} />
            <span className="text-xs text-gray-500">Read out by screen readers.</span>
          </label>
          <label className="text-sm space-y-1">
            <span className="font-medium text-gray-700">Key</span>
            <input
              className={input}
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              placeholder="welcome"
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              required
              maxLength={80}
            />
            <span className="text-xs text-gray-500">Lowercase letters, numbers and hyphens. Pages use this to show the video.</span>
          </label>
          <label className="text-sm space-y-1">
            <span className="font-medium text-gray-700">Who can watch</span>
            <select className={input} value={access} onChange={(e) => setAccess(e.target.value as VideoAccess)}>
              {VIDEO_ACCESS_LEVELS.map((a) => (
                <option key={a} value={a}>{VIDEO_ACCESS_LABELS[a]}</option>
              ))}
            </select>
          </label>

          {mode === 'upload' ? (
            <>
              <label className="text-sm space-y-1">
                <span className="font-medium text-gray-700">Longest it could be (minutes)</span>
                <input
                  type="number"
                  min={1}
                  max={360}
                  className={input}
                  value={maxMinutes}
                  onChange={(e) => setMaxMinutes(Number(e.target.value))}
                />
                <span className="text-xs text-gray-500">Cloudflare refuses files longer than this.</span>
              </label>
              <label className="text-sm space-y-1 sm:col-span-2">
                <span className="font-medium text-gray-700">Video file</span>
                <input type="file" accept="video/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </label>
            </>
          ) : (
            <label className="text-sm space-y-1">
              <span className="font-medium text-gray-700">Cloudflare Stream video ID</span>
              <input className={input} value={streamUid} onChange={(e) => setStreamUid(e.target.value)} required />
              <span className="text-xs text-gray-500">From Stream → Videos in the Cloudflare dashboard. It will be made private.</span>
            </label>
          )}
        </div>

        {progress !== null && (
          <div className="h-2 w-full rounded bg-gray-100" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-2 rounded bg-brand-600 transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}

        {message && (
          <p className={`text-sm ${message.tone === 'error' ? 'text-red-700' : 'text-green-700'}`}>{message.text}</p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          <Upload className="h-4 w-4" aria-hidden="true" />
          {busy ? (progress !== null ? `Uploading… ${progress}%` : 'Working…') : mode === 'upload' ? 'Upload' : 'Link video'}
        </button>
      </form>

      {videos.length === 0 ? (
        <div className="text-center text-sm text-gray-500 py-10">
          <Film className="h-8 w-8 mx-auto mb-2 text-gray-300" aria-hidden="true" />
          No videos yet.
        </div>
      ) : (
        <ul className="space-y-3">
          {videos.map((v) => (
            <li key={v.id} className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-[200px]">
                <p className="font-medium text-brand-900">{v.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Key <code className="bg-gray-100 px-1 rounded">{v.slug}</code>
                  {v.duration_seconds ? ` · ${Math.round(Number(v.duration_seconds) / 60) || '<1'} min` : ''}
                </p>
                {v.error_reason && <p className="text-xs text-red-700 mt-1">{v.error_reason}</p>}
              </div>
              <span className={`text-xs px-2 py-1 rounded-full ${STATUS_STYLES[v.status]}`}>{STATUS_LABELS[v.status]}</span>
              <select
                aria-label={`Who can watch ${v.title}`}
                className="rounded-lg border border-gray-300 px-2 py-1 text-xs"
                value={v.access}
                onChange={(e) => update(v.id, { access: e.target.value as VideoAccess })}
              >
                {VIDEO_ACCESS_LEVELS.map((a) => (
                  <option key={a} value={a}>{VIDEO_ACCESS_LABELS[a]}</option>
                ))}
              </select>
              {v.status !== 'ready' && (
                <button
                  type="button"
                  onClick={() => refresh(v.id)}
                  className="inline-flex items-center gap-1 text-xs text-brand-700 hover:underline"
                >
                  <RefreshCw className="h-3 w-3" aria-hidden="true" /> Check status
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
