import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserAccess } from '@/lib/access'
import { sanitizeError } from '@/lib/sanitize-error'
import { rateLimit } from '@/lib/rate-limit'
import { withMonitoring, recordEvent } from '@/lib/monitoring'
import { getLocale } from 'next-intl/server'
import { pickLocalizedModules } from '@/lib/content-locale'

export const dynamic = 'force-dynamic'

async function getHandler(request: NextRequest) {
  const { success } = await rateLimit(request, { limit: 30, windowMs: 60_000 })
  if (!success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category')
  const slug = searchParams.get('slug')

  const { isPremium } = await getUserAccess(supabase, user.id)
  const locale = await getLocale()

  const COLUMNS = 'id, slug, title, body_md, tier, category, tags, locale, estimated_read_minutes, published_at'

  function baseQuery() {
    let query = supabase
      .from('content_modules')
      .select(COLUMNS)
      .not('published_at', 'is', null)
      .lte('published_at', new Date().toISOString())
      .order('published_at', { ascending: false })

    if (slug) query = query.eq('slug', slug)
    if (category) query = query.eq('category', category)
    if (!isPremium) query = query.eq('tier', 'free')
    return query
  }

  try {
    let data: unknown

    if (slug) {
      // Single-article lookup: try the requested locale, then fall back to
      // English rather than 404ing on an untranslated article.
      const { data: localized, error } = await baseQuery().eq('locale', locale).maybeSingle()
      if (error) throw error
      if (localized) {
        data = localized
      } else if (locale !== 'en') {
        const { data: fallback, error: fallbackError } = await baseQuery().eq('locale', 'en').maybeSingle()
        if (fallbackError) throw fallbackError
        data = fallback
      } else {
        data = null
      }
    } else {
      // List lookup: fetch both the requested locale and English, then dedupe
      // per slug (preferring the requested locale) so untranslated articles
      // still appear via their English row instead of vanishing.
      const { data: rawData, error } = await baseQuery()
        .in('locale', Array.from(new Set([locale, 'en'])))
        .limit(100)
      if (error) throw error
      data = pickLocalizedModules((rawData ?? []) as { slug: string; locale: string }[], locale).slice(0, 50)
    }

    return NextResponse.json({ data, is_premium: isPremium })
  } catch (err) {
    await recordEvent({
      type: 'error', route: '/api/content', method: 'GET', status: 500,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack ?? null : null,
      userId: user.id,
    })
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 })
  }
}

export const GET = withMonitoring('/api/content', getHandler)
