import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin-auth'
import { rateLimit } from '@/lib/rate-limit'
import { sanitizeError } from '@/lib/sanitize-error'
import { INTAKE_BUCKET, isAllowedMime } from '@/lib/intake-documents'
import { FOUNDATION_ROUND } from '@/lib/content-intake-config'

/**
 * GET /api/admin/intake/documents?topicId=...
 * Lists uploaded source documents for a topic, newest first.
 */
export async function GET(request: NextRequest) {
  const { success } = rateLimit(request, { limit: 60, windowMs: 60_000 })
  if (!success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  const supabase = createClient()
  const auth = await requireAdmin(supabase)
  if (auth instanceof NextResponse) return auth

  const topicId = new URL(request.url).searchParams.get('topicId')

  try {
    const admin = createAdminClient()
    let query = admin
      .from('content_intake_documents')
      .select('*')
      .eq('round', FOUNDATION_ROUND)
      .order('created_at', { ascending: false })

    query = topicId ? query.eq('topic_id', topicId) : query.is('topic_id', null)

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 })
  }
}

/**
 * POST /api/admin/intake/documents
 * Records a document row AFTER the browser has uploaded the file to Storage via
 * a signed URL. Verifies the object actually exists (and trusts Storage's own
 * size over the client-reported value) before inserting.
 *
 * Body: { path, fileName, mimeType, sizeBytes, topicId?, topicLabel?,
 *         sourceNote?, brandingNote? }
 */
export async function POST(request: NextRequest) {
  const { success } = rateLimit(request, { limit: 30, windowMs: 60_000 })
  if (!success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  const supabase = createClient()
  const auth = await requireAdmin(supabase)
  if (auth instanceof NextResponse) return auth

  let body: {
    path?: string
    fileName?: string
    mimeType?: string
    sizeBytes?: number
    topicId?: string
    topicLabel?: string
    sourceNote?: string
    brandingNote?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const path = body.path?.trim() ?? ''
  const fileName = body.fileName?.trim() ?? ''
  const mimeType = body.mimeType?.trim() ?? ''

  // The path must be one we minted (round-prefixed) — never an arbitrary key.
  if (!path.startsWith(`${FOUNDATION_ROUND}/`) || path.includes('..')) {
    return NextResponse.json({ error: 'Invalid storage path' }, { status: 400 })
  }
  if (!fileName) {
    return NextResponse.json({ error: 'Missing file name' }, { status: 400 })
  }
  if (!isAllowedMime(mimeType)) {
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 })
  }

  try {
    const admin = createAdminClient()

    // Confirm the object exists in Storage and read its authoritative size.
    const slash = path.lastIndexOf('/')
    const folder = path.slice(0, slash)
    const name = path.slice(slash + 1)
    const { data: listed, error: listErr } = await admin.storage
      .from(INTAKE_BUCKET)
      .list(folder, { search: name, limit: 100 })
    if (listErr) throw listErr

    const object = listed?.find((o) => o.name === name)
    if (!object) {
      return NextResponse.json(
        { error: 'Upload not found in storage' },
        { status: 400 },
      )
    }
    const storageSize = object.metadata?.size as number | undefined
    const sizeBytes = storageSize ?? Number(body.sizeBytes) ?? 0

    const topicId = body.topicId?.trim() || null

    const { data, error } = await admin
      .from('content_intake_documents')
      .insert({
        topic_id: topicId,
        topic_label: body.topicLabel?.trim() || null,
        file_name: fileName,
        storage_path: path,
        mime_type: mimeType,
        size_bytes: sizeBytes,
        source_note: body.sourceNote?.trim() || null,
        branding_note: body.brandingNote?.trim() || null,
        round: FOUNDATION_ROUND,
        uploaded_by: auth.id,
      })
      .select('*')
      .single()

    if (error) {
      // Orphan cleanup: if the row insert failed, don't leave the file behind.
      await admin.storage.from(INTAKE_BUCKET).remove([path])
      throw error
    }

    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 })
  }
}
