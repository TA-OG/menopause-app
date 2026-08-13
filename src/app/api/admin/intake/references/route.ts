import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin-auth'
import { rateLimit } from '@/lib/rate-limit'
import { sanitizeError } from '@/lib/sanitize-error'

const referenceSchema = z.object({
  documentId: z.string().uuid().nullish(),
  topicId: z.string().trim().min(1).nullish(),
  title: z.string().trim().min(1, 'Title is required').max(500),
  authors: z.string().trim().max(500).nullish(),
  publication: z.string().trim().max(500).nullish(),
  year: z.coerce.number().int().gte(1500).lte(2200).nullish(),
  url: z.string().trim().url().max(2000).nullish().or(z.literal('')),
  doi: z.string().trim().max(255).nullish(),
  notes: z.string().trim().max(2000).nullish(),
})

/**
 * GET /api/admin/intake/references?topicId=...
 * Lists external citations recorded for a topic, newest first.
 */
export async function GET(request: NextRequest) {
  const { success } = await rateLimit(request, { limit: 60, windowMs: 60_000 })
  if (!success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  const supabase = createClient()
  const auth = await requireAdmin(supabase)
  if (auth instanceof NextResponse) return auth

  const topicId = new URL(request.url).searchParams.get('topicId')

  try {
    const admin = createAdminClient()
    let query = admin
      .from('content_intake_references')
      .select('*')
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
 * POST /api/admin/intake/references
 * Records an external study/publication that backs Pamela's advice.
 */
export async function POST(request: NextRequest) {
  const { success } = await rateLimit(request, { limit: 30, windowMs: 60_000 })
  if (!success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  const supabase = createClient()
  const auth = await requireAdmin(supabase)
  if (auth instanceof NextResponse) return auth

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = referenceSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid reference' },
      { status: 400 },
    )
  }
  const r = parsed.data

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('content_intake_references')
      .insert({
        document_id: r.documentId ?? null,
        topic_id: r.topicId ?? null,
        title: r.title,
        authors: r.authors || null,
        publication: r.publication || null,
        year: r.year ?? null,
        url: r.url || null,
        doi: r.doi || null,
        notes: r.notes || null,
        added_by: auth.id,
      })
      .select('*')
      .single()

    if (error) throw error

    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 })
  }
}
