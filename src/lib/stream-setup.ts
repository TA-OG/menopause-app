/**
 * Pure helpers for scripts/stream-setup.ts.
 *
 * They live under src/ (not scripts/) so they're type-checked by
 * `npm run type-check` and covered by `npm run test:run` — tsconfig.json
 * excludes scripts/.
 */

/**
 * Set keys in a dotenv file's text, keeping every other line (comments,
 * blank lines, unrelated keys) exactly as it was. An existing key is replaced
 * in place; a new one is appended. Values are written unquoted, so they must
 * be single-line, which every value this setup produces is.
 */
export function upsertEnvFile(content: string, entries: Record<string, string>): string {
  for (const [key, value] of Object.entries(entries)) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) throw new Error(`Invalid env var name: ${key}`)
    if (/[\r\n]/.test(value)) throw new Error(`${key} must be a single line`)
  }

  const remaining = new Map(Object.entries(entries))
  const lines = content.length ? content.replace(/\r?\n$/, '').split(/\r?\n/) : []

  const updated = lines.map((line) => {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line)
    if (!match || !remaining.has(match[1])) return line
    const key = match[1]
    const value = remaining.get(key) as string
    remaining.delete(key)
    return `${key}=${value}`
  })

  for (const [key, value] of Array.from(remaining)) updated.push(`${key}=${value}`)
  return updated.join('\n') + '\n'
}

/**
 * Pull the customer code out of any Stream delivery URL, e.g. a video's
 * `thumbnail` or `preview`: https://customer-<code>.cloudflarestream.com/…
 */
export function customerCodeFromUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const match = /^https:\/\/customer-([a-z0-9]+)\.cloudflarestream\.com\//.exec(url)
  return match ? match[1] : null
}

/**
 * Where Cloudflare should send "video ready" notifications, from the app's
 * public URL. Refuses anything Cloudflare couldn't reach from the internet.
 */
export function webhookUrlFor(appUrl: string): string {
  let url: URL
  try {
    url = new URL(appUrl)
  } catch {
    throw new Error(`"${appUrl}" is not a URL. Pass the live site, e.g. https://auntymel.app`)
  }
  if (url.protocol !== 'https:') throw new Error('The app URL must be https.')
  if (/^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(url.hostname)) {
    throw new Error('Cloudflare cannot reach localhost. Pass the live site, e.g. https://auntymel.app')
  }
  return `${url.origin}/api/stream/webhook`
}
