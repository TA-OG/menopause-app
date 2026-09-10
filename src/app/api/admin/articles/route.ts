import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin-auth'
import { rateLimit } from '@/lib/rate-limit'
import { sanitizeError } from '@/lib/sanitize-error'
import { recordRevision } from '@/lib/article-revisions'
import {
  createArticleSchema,
  slugify,
  uniqueSlug,
  estimateReadMinutes,
} from '@/lib/article-authoring'

/**
 * Learn articles — list and create.
 *
 * GET  /api/admin/articles   → every article, drafts included
 * POST /api/admin/articles   → create a new one (always as a draft)
 *
 * Both read and write through the service-role client: drafts are invisible to
 * every other client by RLS (026), and only the service role may write to
 * content_modules at all (007). The admin gate is `requireAdmin`, applied
 * per-route so these are never reachable without it.
 *
 * A new article is never born published. Creating and publishing are separate
 * decisions, and POST /api/admin/articles/[id]/publish is the only way an
 * article reaches a reader.
 */

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { success } = await rateLimit(request, { limit: 60, windowMs: 60_000 })
  if (!success) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  const supabase = createClient()
  const auth = await requireAdmin(supabase)
  if (auth instanceof NextResponse) return auth

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('content_modules')
      .select(
        'id, slug, title, tier, category, tags, estimated_read_minutes, published_at, created_at, updated_at',
      )
      .order('updated_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({ articles: data ?? [] })
  } catch (err) {
    console.error('Failed to list articles', { actor_id: auth.id, error: err })
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const { success } = await rateLimit(request, { limit: 30, windowMs: 60_000 })
  if (!success) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  const supabase = createClient()
  const auth = await requireAdmin(supabase)
  if (auth instanceof NextResponse) return auth

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = createArticleSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? 'Those details are not valid.' },
      { status: 400 },
    )
  }
  const input = parsed.data

  try {
    const admin = createAdminClient()

    // Resolve the slug against what already exists. The UNIQUE constraint on
    // content_modules.slug is the real arbiter — this just spares the author
    // a collision error on the common case of two articles sharing a title.
    const { data: existing, error: slugError } = await admin
      .from('content_modules')
      .select('slug')

    if (slugError) throw slugError

    const takenSlugs = (existing ?? []).map((row) => row.slug as string)
    const desired = input.slug ?? slugify(input.title)
    const slug = uniqueSlug(desired, takenSlugs)

    const { data: created, error: insertError } = await admin
      .from('content_modules')
      .insert({
        slug,
        title: input.title,
        body_md: input.body_md,
        tier: input.tier,
        category: input.category,
        tags: input.tags,
        estimated_read_minutes:
          input.estimated_read_minutes ?? estimateReadMinutes(input.body_md),
        // Always a draft. Publishing is its own endpoint and its own decision.
        published_at: null,
        created_by: auth.id,
        updated_by: auth.id,
      })
      .select(
        'id, slug, title, body_md, tier, category, tags, estimated_read_minutes, published_at, created_at, updated_at',
      )
      .single()

    if (insertError) {
      // 23505 = unique_violation. Only reachable if another article was created
      // between the slug check above and this insert.
      if (insertError.code === '23505') {
        return NextResponse.json(
          { error: 'An article with that web address already exists. Try a different title.' },
          { status: 409 },
        )
      }
      throw insertError
    }

    await recordRevision(admin, 'created', created, { id: auth.id, email: auth.email })

    return NextResponse.json({ article: created }, { status: 201 })
  } catch (err) {
    console.error('Failed to create article', { actor_id: auth.id, error: err })
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 })
  }
}
