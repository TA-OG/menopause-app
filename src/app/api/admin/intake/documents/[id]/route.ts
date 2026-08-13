import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin-auth'
import { rateLimit } from '@/lib/rate-limit'
import { sanitizeError } from '@/lib/sanitize-error'
import { INTAKE_BUCKET } from '@/lib/intake-documents'

/**
 * GET /api/admin/intake/documents/[id]
 * Returns a short-lived signed URL to download the original file. The bucket is
 * private, so this is the only way to retrieve a document, and only admins can.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const { success } = await rateLimit(request, { limit: 60, windowMs: 60_000 })
  if (!success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  const supabase = createClient()
  const auth = await requireAdmin(supabase)
  if (auth instanceof NextResponse) return auth

  try {
    const admin = createAdminClient()
    const { data: doc, error } = await admin
      .from('content_intake_documents')
      .select('storage_path, file_name')
      .eq('id', params.id)
      .single()
    if (error) throw error
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { data: signed, error: signErr } = await admin.storage
      .from(INTAKE_BUCKET)
      .createSignedUrl(doc.storage_path, 60, { download: doc.file_name })
    if (signErr) throw signErr

    return NextResponse.json({ url: signed.signedUrl })
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 })
  }
}

/**
 * DELETE /api/admin/intake/documents/[id]
 * Removes the Storage object then the row. Linked references cascade.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const { success } = await rateLimit(request, { limit: 30, windowMs: 60_000 })
  if (!success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  const supabase = createClient()
  const auth = await requireAdmin(supabase)
  if (auth instanceof NextResponse) return auth

  try {
    const admin = createAdminClient()
    const { data: doc, error } = await admin
      .from('content_intake_documents')
      .select('storage_path')
      .eq('id', params.id)
      .single()
    if (error) throw error
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { error: rmErr } = await admin.storage
      .from(INTAKE_BUCKET)
      .remove([doc.storage_path])
    if (rmErr) throw rmErr

    const { error: delErr } = await admin
      .from('content_intake_documents')
      .delete()
      .eq('id', params.id)
    if (delErr) throw delErr

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 })
  }
}
