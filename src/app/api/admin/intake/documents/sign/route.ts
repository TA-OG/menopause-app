import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin-auth'
import { rateLimit } from '@/lib/rate-limit'
import { sanitizeError } from '@/lib/sanitize-error'
import {
  INTAKE_BUCKET,
  MAX_FILE_BYTES,
  isAllowedMime,
  buildStoragePath,
} from '@/lib/intake-documents'
import { FOUNDATION_ROUND } from '@/lib/content-intake-config'

/**
 * Mints a one-time signed upload URL so the browser can send the file straight
 * to Storage (bypassing the serverless request-body size limit). The file type
 * and size are validated here, before any bytes are accepted; the storage key
 * is server-generated and never user-controlled.
 *
 * Body: { mimeType: string, sizeBytes: number }
 * Returns: { path, token }
 */
export async function POST(request: NextRequest) {
  const { success } = rateLimit(request, { limit: 30, windowMs: 60_000 })
  if (!success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  const supabase = createClient()
  const auth = await requireAdmin(supabase)
  if (auth instanceof NextResponse) return auth

  let body: { mimeType?: string; sizeBytes?: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const mimeType = body.mimeType?.trim() ?? ''
  const sizeBytes = Number(body.sizeBytes)

  if (!isAllowedMime(mimeType)) {
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 })
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return NextResponse.json({ error: 'Invalid file size' }, { status: 400 })
  }
  if (sizeBytes > MAX_FILE_BYTES) {
    return NextResponse.json({ error: 'File is too large (max 25 MB)' }, { status: 400 })
  }

  const path = buildStoragePath(FOUNDATION_ROUND, mimeType)

  try {
    const admin = createAdminClient()
    const { data, error } = await admin.storage
      .from(INTAKE_BUCKET)
      .createSignedUploadUrl(path)

    if (error) throw error

    return NextResponse.json({ path: data.path, token: data.token })
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 })
  }
}
