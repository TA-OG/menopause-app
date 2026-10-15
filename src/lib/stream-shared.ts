/**
 * Video library constants and types that are safe in the browser.
 *
 * Kept apart from ./stream.ts, which imports Node's crypto and reads secrets,
 * so client components (the /admin/videos screen) can use these without
 * pulling server code into the bundle.
 */

export const VIDEO_ACCESS_LEVELS = ['public', 'signed_in', 'premium'] as const
export type VideoAccess = (typeof VIDEO_ACCESS_LEVELS)[number]

export const VIDEO_ACCESS_LABELS: Record<VideoAccess, string> = {
  public: 'Everyone — including people who are not signed in',
  signed_in: 'Anyone signed in (free or premium)',
  premium: 'Premium only',
}

export type VideoStatus = 'awaiting_upload' | 'processing' | 'ready' | 'error'

/**
 * Basic-POST direct creator uploads accept files up to 200 MB (Cloudflare's
 * limit for this method). Larger files are uploaded in the Cloudflare
 * dashboard and then linked by id.
 */
export const DIRECT_UPLOAD_MAX_BYTES = 200 * 1024 * 1024

/** A row of `videos` (036) as the admin screens read it. */
export interface VideoRow {
  id: string
  slug: string
  title: string
  stream_uid: string
  access: VideoAccess
  status: VideoStatus
  error_reason: string | null
  duration_seconds: number | null
  created_at: string
  updated_at: string
}
