/**
 * Shared config for the content-intake source library (migration 017).
 *
 * Single source of truth for the Storage bucket, upload constraints, and the
 * row shapes — reused by the API routes and the admin UI so limits can't drift
 * between client validation and server enforcement.
 */

/** Private Supabase Storage bucket holding Pamela's uploaded source files. */
export const INTAKE_BUCKET = 'intake-sources'

/** Hard cap on a single upload. Enforced server-side in /sign. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024 // 25 MB

/**
 * Accepted file types. PDFs/Word for studies and papers, plain text/markdown
 * for notes, images for scanned documents. The matching extensions feed the
 * file picker's `accept` attribute.
 */
export const ALLOWED_MIME: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'text/plain': '.txt',
  'text/markdown': '.md',
  'image/jpeg': '.jpg',
  'image/png': '.png',
}

/** `accept` attribute value for the upload <input type="file">. */
export const ACCEPT_ATTR = Object.values(ALLOWED_MIME).join(',')

export function isAllowedMime(mime: string): boolean {
  return Object.prototype.hasOwnProperty.call(ALLOWED_MIME, mime)
}

/**
 * Build the storage object key. The key is fully server-generated from a random
 * UUID so it is never user-controlled (no path traversal / collisions); the
 * original file name is preserved only as table data. The extension is derived
 * from the (allowlisted) MIME type, not from the supplied name.
 */
export function buildStoragePath(round: string, mime: string): string {
  const ext = ALLOWED_MIME[mime] ?? ''
  return `${round}/${crypto.randomUUID()}${ext}`
}

export interface IntakeDocument {
  id: string
  topic_id: string | null
  topic_label: string | null
  file_name: string
  storage_path: string
  mime_type: string
  size_bytes: number
  source_note: string | null
  branding_note: string | null
  status: 'uploaded' | 'reviewed' | 'archived'
  round: string
  uploaded_by: string | null
  created_at: string
  updated_at: string
}

export interface IntakeReference {
  id: string
  document_id: string | null
  topic_id: string | null
  title: string
  authors: string | null
  publication: string | null
  year: number | null
  url: string | null
  doi: string | null
  notes: string | null
  added_by: string | null
  created_at: string
  updated_at: string
}
