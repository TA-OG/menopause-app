-- ============================================================
-- 035_article_authoring.sql
-- Let Pamela write, edit and publish Learn articles from the app.
--
-- Until now there was no way for her to put an article in front of a reader
-- at all. The only path into content_modules was a developer writing a YAML
-- file into content/modules/{free,premium}/ and running `npm run
-- import-content` from a terminal. That is why the Learn library is empty:
-- content_modules has never held a single row in production.
--
-- This migration does NOT add a gate. The read policy from
-- 026_content_modules_premium_rls.sql is deliberately left exactly as it is —
-- an article is visible when it has a published_at in the past and the reader
-- is entitled to its tier, and nothing more is required of it. Adding an
-- approval requirement on top would hide content rather than produce it, and
-- Pamela is both the author and the clinical authority here: her pressing
-- "Publish" IS the sign-off. There is no second person to wait for.
--
-- What it adds is authorship and history:
--
--   1. Who wrote and who last changed each article (created_by / updated_by).
--   2. An append-only record of every save, publish and unpublish, with the
--      exact wording as it stood at that moment.
--
-- (2) is the part that matters for health content. When an article tells a
-- woman what to take for hot flushes, "what did this say on the day she read
-- it, and who put it there" has to be answerable months later.
-- ============================================================

-- ─── Authorship on the article itself ──────────────────────────────────────
-- Nullable: every existing row (there are none today, but a restore or a
-- seeded import could create some) predates authorship, and an unknown author
-- must read as unknown rather than be attributed to whoever ran the import.
ALTER TABLE content_modules
  ADD COLUMN created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN content_modules.created_by IS
  'The admin who first created this article in /admin/articles. NULL for rows '
  'loaded by the YAML import, which has no author.';
COMMENT ON COLUMN content_modules.updated_by IS
  'The admin who last saved this article. Full history is in '
  'content_module_revisions.';

-- ─── History ───────────────────────────────────────────────────────────────
CREATE TYPE content_revision_action AS ENUM (
  'created',
  'edited',
  'published',
  'unpublished',
  'deleted'
);

-- module_id is deliberately NOT a foreign key.
--
-- The obvious version — REFERENCES content_modules(id) ON DELETE CASCADE —
-- cannot coexist with the append-only trigger below: a cascade is itself a
-- DELETE on this table, and ON DELETE SET NULL is an UPDATE, so either would
-- be refused by the trigger and would make the article undeletable. More
-- importantly, the history of an article that has been deleted is exactly the
-- history most worth keeping. So the link is a plain id and the identifying
-- details (slug, title) are denormalised: this table stands on its own.
CREATE TABLE content_module_revisions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  module_id     UUID NOT NULL,
  slug          TEXT NOT NULL,
  action        content_revision_action NOT NULL,

  -- The article as it stood immediately AFTER this action. A row with
  -- action='published' therefore holds the exact words that went live.
  title         TEXT NOT NULL,
  body_md       TEXT NOT NULL,
  tier          content_tier NOT NULL,
  category      TEXT NOT NULL,
  published_at  TIMESTAMPTZ,

  -- actor_id is a plain id for the same reason as module_id above, and the
  -- reason is not theoretical: with `REFERENCES auth.users(id) ON DELETE SET
  -- NULL`, deleting a user makes Postgres UPDATE this table, the append-only
  -- trigger refuses it, and the account deletion fails outright — taking the
  -- app's right-to-erasure path (/data-deletion) down with it.
  --
  -- actor_email is kept after an account is deleted so a published article
  -- still says who published it. That is a deliberate retention decision:
  -- clinical accountability for health content outlives a staff account.
  actor_id      UUID,
  actor_email   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_content_revisions_module
  ON content_module_revisions(module_id, created_at DESC);

ALTER TABLE content_module_revisions ENABLE ROW LEVEL SECURITY;

-- No policy for `authenticated`, so no reader can see this table at all. The
-- admin screens read it through the service-role client instead.
--
-- Note there is deliberately no "service role" policy either: the service role
-- carries BYPASSRLS in Supabase, so such a policy would be decorative — it
-- grants nothing that isn't already granted, and reads as a restriction that
-- isn't one. The real restriction is the trigger below, which the service role
-- cannot bypass.
CREATE OR REPLACE FUNCTION public.content_revisions_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'content_module_revisions is append-only: % is not permitted. '
    'Article history must not be rewritten.', TG_OP;
END;
$$;

-- Row triggers, not statement triggers, so this holds for a bulk UPDATE or
-- DELETE as well as a single-row one. An audit trail that the application's
-- own service-role key can quietly edit is not an audit trail — this is what
-- makes the claim true rather than a matter of convention.
CREATE TRIGGER content_revisions_no_update
  BEFORE UPDATE ON content_module_revisions
  FOR EACH ROW EXECUTE FUNCTION public.content_revisions_append_only();

CREATE TRIGGER content_revisions_no_delete
  BEFORE DELETE ON content_module_revisions
  FOR EACH ROW EXECUTE FUNCTION public.content_revisions_append_only();
