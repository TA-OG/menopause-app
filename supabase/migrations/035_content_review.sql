-- ============================================================
-- 035_content_review.sql
-- Article review & approval — Pamela's sign-off gate.
--
-- Until now the only thing standing between a written article and a
-- woman reading it was `published_at`, set by hand in the YAML file
-- (content/modules/{free,premium}/*.yaml) and pushed live by whoever
-- ran `npm run import-content`. Nobody had to read the article first,
-- and the author of the file and the person publishing it were the
-- same person. For health content that is not a review process.
--
-- This migration adds the gate:
--
--   review_status = 'approved'  is now REQUIRED for a user to read an
--   article, enforced in RLS rather than in application code.
--
-- The RLS placement is deliberate and follows the lesson of
-- 026_content_modules_premium_rls.sql: the app ships a fully-configured
-- browser Supabase client with the anon key, so any check that lives
-- only in a .select() filter is decoration. An unapproved article must
-- be unreadable however the table is queried.
--
-- Two further properties matter as much as the gate itself:
--
--   1. Approval is per-wording, not per-article. Editing the title or
--      the body of an approved article revokes the approval (trigger
--      below). Otherwise "approved" would mean "was approved once, at
--      some point, in some wording" — which is worse than no approval
--      at all, because it looks like assurance.
--
--   2. Approval cannot be granted by an import. `review_status` has no
--      path in from the YAML pipeline; it moves only through the admin
--      review API, by a named admin, and every move is recorded in
--      content_review_events.
-- ============================================================

-- ─── Review state ──────────────────────────────────────────────────────────
--   draft             — being written; not yet in front of the reviewer
--   in_review         — waiting for the reviewer to read it
--   changes_requested — read, sent back, with a note saying why
--   approved          — signed off in this exact wording; may go live
CREATE TYPE content_review_status AS ENUM (
  'draft',
  'in_review',
  'changes_requested',
  'approved'
);

ALTER TABLE content_modules
  ADD COLUMN review_status content_review_status NOT NULL DEFAULT 'in_review',
  ADD COLUMN reviewed_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN reviewed_at   TIMESTAMPTZ,
  ADD COLUMN review_note   TEXT;

COMMENT ON COLUMN content_modules.review_status IS
  'Sign-off state. Only ''approved'' is readable by users (see RLS policy). '
  'Set exclusively by the admin review API — never by the YAML import.';
COMMENT ON COLUMN content_modules.review_note IS
  'The reviewer''s note from the most recent decision — the reason changes '
  'were requested, or any remark left when approving. Full history lives in '
  'content_review_events.';

-- The DEFAULT above backfills every existing row as 'in_review'. That is the
-- intended outcome, not an accident of the default: any article already in the
-- table was published without anyone signing it off, so none of them can be
-- assumed approved. They keep their published_at, but they go into the queue
-- and stop being readable until someone has actually read them.

CREATE INDEX idx_content_modules_review_status ON content_modules(review_status);

-- ─── Approval does not survive a rewrite ───────────────────────────────────
-- Fires on any UPDATE, whatever the caller: the admin API, the import script,
-- a service-role query, psql. If the words a user would read have changed,
-- the previous approval no longer describes what is on the page, so it is
-- withdrawn and the article returns to the queue.
--
-- Scope is title + body_md: the text a reviewer actually reads and signs off.
-- tier, category, tags and estimated_read_minutes are distribution metadata —
-- they change who is shown the article and where it is filed, not what it
-- claims — so changing them does not invalidate a sign-off.
--
-- The condition is on NEW.review_status rather than OLD, which covers one case
-- the obvious version misses. Editing an approved article trips it, because
-- NEW inherits 'approved' from the row. So does a single statement that
-- rewrites body_md AND sets review_status = 'approved' in one go — the direct
-- bypass. What it deliberately does not touch is a statement that edits the
-- text and moves the article to some other state itself: that is already not
-- approved, so there is nothing to withdraw.
--
-- An approval, by contrast, changes only the review columns and leaves title
-- and body_md alone, so it passes through untouched.
CREATE OR REPLACE FUNCTION public.revoke_approval_on_content_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.review_status = 'approved'
     AND (NEW.title IS DISTINCT FROM OLD.title
          OR NEW.body_md IS DISTINCT FROM OLD.body_md)
  THEN
    NEW.review_status := 'in_review';
    NEW.reviewed_by   := NULL;
    NEW.reviewed_at   := NULL;
    NEW.review_note   := NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- Postgres fires same-timing row triggers in name order, so this runs before
-- content_modules_updated_at. They touch disjoint columns, so the order does
-- not actually matter — noted only so nobody has to work it out again.
CREATE TRIGGER content_modules_revoke_approval
  BEFORE UPDATE ON content_modules
  FOR EACH ROW EXECUTE FUNCTION public.revoke_approval_on_content_change();

-- ─── Audit trail ───────────────────────────────────────────────────────────
-- Who signed off what, when, in which wording. `content_snapshot` records the
-- exact title and body at the moment of the decision, so a past approval can
-- be checked against the words it was actually given for.
CREATE TABLE content_review_events (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  module_id        UUID NOT NULL REFERENCES content_modules(id) ON DELETE CASCADE,
  slug             TEXT NOT NULL,          -- denormalised: survives a slug change
  from_status      content_review_status,
  to_status        content_review_status NOT NULL,
  note             TEXT,
  content_snapshot JSONB,                  -- { title, body_md } as reviewed
  actor_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email      TEXT,                   -- denormalised: survives account deletion
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE content_review_events ENABLE ROW LEVEL SECURITY;

-- Written only by the admin review API, via the service role. There is no
-- update or delete path by design — an audit trail that can be edited is not
-- an audit trail.
CREATE POLICY "Service role manages review events"
  ON content_review_events FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

CREATE INDEX idx_review_events_module ON content_review_events(module_id, created_at DESC);

-- ─── The gate ──────────────────────────────────────────────────────────────
-- Replaces the policy from 026_content_modules_premium_rls.sql, preserving its
-- tier check verbatim and adding the sign-off requirement.
--
-- Admins are NOT exempt. has_premium_access() lets the content team read
-- premium articles without paying, which is about the paywall; it says nothing
-- about whether an article has been checked. Unreviewed content should not
-- appear in the reader-facing app for anyone — the admin review page reads it
-- through the service-role client instead, which is where reviewing belongs.
DROP POLICY IF EXISTS "Authenticated users can read accessible content" ON content_modules;

CREATE POLICY "Authenticated users can read approved accessible content"
  ON content_modules FOR SELECT
  TO authenticated
  USING (
    review_status = 'approved'
    AND published_at IS NOT NULL
    AND published_at <= NOW()
    AND (tier = 'free' OR public.has_premium_access())
  );
