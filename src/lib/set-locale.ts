/**
 * Browser-side: ask the server to switch this visitor's language.
 *
 * POST /api/locale sets the NEXT_LOCALE cookie (and the signed-in user's
 * profiles.locale). The caller must router.refresh() afterwards so server
 * components re-render with the new messages.
 *
 * Throws on a non-2xx response. Callers used to ignore the status, so a
 * rate-limited or rejected switch refreshed the page into the same language
 * and looked like the control was broken.
 */
export async function setLocale(locale: string): Promise<void> {
  const res = await fetch('/api/locale', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ locale }),
  })
  if (!res.ok) throw new Error(`Language change failed (${res.status})`)
}
