import type { SupabaseClient } from '@supabase/supabase-js'
import type { ContentRevisionAction, ContentTier } from '@/types/database'

/**
 * Append one entry to an article's history.
 *
 * Every save, publish, unpublish and delete goes through here, so
 * content_module_revisions holds the exact wording an article had after each
 * change and who made it. For health content that record is the thing that
 * makes "what did this article say when she read it, and who put it there"
 * answerable months later.
 *
 * The table is append-only at the database level (035_article_authoring.sql
 * raises on UPDATE and DELETE), so this is the only operation it supports.
 */

export interface RevisionSnapshot {
  id: string
  slug: string
  title: string
  body_md: string
  tier: ContentTier
  category: string
  published_at: string | null
}

export interface RevisionActor {
  id: string
  email: string | null
}

/**
 * Record a revision. Never throws.
 *
 * Deliberately non-blocking: the change it describes has already been
 * committed, so throwing here would report failure for work that actually
 * succeeded and invite the author to repeat it. A failure is logged with full
 * context instead — loudly, because a publish nobody can trace is a real gap
 * even though it is not a reason to reject the publish itself.
 *
 * Returns whether the entry was written, so a caller that wants to surface a
 * degraded audit trail can.
 */
export async function recordRevision(
  admin: SupabaseClient,
  action: ContentRevisionAction,
  article: RevisionSnapshot,
  actor: RevisionActor,
): Promise<boolean> {
  const { error } = await admin.from('content_module_revisions').insert({
    module_id: article.id,
    slug: article.slug,
    action,
    title: article.title,
    body_md: article.body_md,
    tier: article.tier,
    category: article.category,
    published_at: article.published_at,
    actor_id: actor.id,
    actor_email: actor.email,
  })

  if (error) {
    console.error('Failed to record article revision', {
      action,
      module_id: article.id,
      slug: article.slug,
      actor_id: actor.id,
      error: error.message,
    })
    return false
  }

  return true
}
