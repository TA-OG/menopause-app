import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sanitizeError } from '@/lib/sanitize-error'
import { rateLimit } from '@/lib/rate-limit'

export async function GET(request: NextRequest) {
  const { success } = rateLimit(request, { limit: 30, windowMs: 60_000 })
  if (!success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category')
  const slug = searchParams.get('slug')

  const { data: profile } = await supabase
    .from('profiles')
    .select('subscription_tier')
    .eq('id', user.id)
    .single()

  const isPremium = profile?.subscription_tier === 'premium'

  try {
    let query = supabase
      .from('content_modules')
      .select('id, slug, title, body_md, tier, category, tags, estimated_read_minutes, published_at')
      .not('published_at', 'is', null)
      .lte('published_at', new Date().toISOString())
      .order('published_at', { ascending: false })

    if (slug) {
      query = query.eq('slug', slug)
    }
    if (category) {
      query = query.eq('category', category)
    }
    if (!isPremium) {
      query = query.eq('tier', 'free')
    }

    const { data, error } = slug
      ? await query.single()
      : await query.limit(50)

    if (error) throw error

    return NextResponse.json({ data, is_premium: isPremium })
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 })
  }
}
