/** Small fetch helpers for the journey screens. Errors carry the server's own words. */

export async function saveAnswer(questionKey: string, values: string[]): Promise<void> {
  const res = await fetch('/api/onboarding/answers', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question_key: questionKey, values }),
  })
  if (!res.ok) throw new Error(await errorText(res, "That didn't save. Please try again."))
}

export async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(await errorText(res, 'Something went wrong loading this. Please try again.'))
  const body = await res.json()
  return body.data as T
}

export async function postJSON<T>(url: string, payload: unknown): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string; gate?: string }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const body = await res.json().catch(() => ({}))
  if (res.ok) return { ok: true, data: body.data as T }
  return { ok: false, status: res.status, error: body.error ?? 'Something went wrong. Please try again.', gate: body.gate }
}

async function errorText(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null)
  return typeof body?.error === 'string' ? body.error : fallback
}
