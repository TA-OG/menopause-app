-- ============================================================
-- 033_admin_invites_access_override_kind.sql
--
-- Adds 'access_override' to admin_invites.invite_kind.
--
-- "User access overrides" on the admin dashboard previously refused any email
-- that did not already have an account ("They must have signed up first"),
-- which made it useless for its actual purpose: standing up a tester or beta
-- pilot who has never heard of the app yet. It also granted geographic access
-- only — the person could reach the app from a disabled country and then hit
-- the paywall, because no complimentary premium accompanied the override.
--
-- Granting an override now sends the same Supabase invite email as a waitlist
-- invite and carries the same 12 months of complimentary premium, so those
-- invites need to appear in the same audit log with a kind of their own.
--
-- Migrations are append-only here (see CLAUDE.md), so the CHECK constraint is
-- replaced rather than edited in place.
-- ============================================================

ALTER TABLE admin_invites
  DROP CONSTRAINT IF EXISTS admin_invites_invite_kind_check;

ALTER TABLE admin_invites
  ADD CONSTRAINT admin_invites_invite_kind_check
  CHECK (invite_kind IN ('waitlist', 'author', 'access_override'));

COMMENT ON COLUMN admin_invites.invite_kind IS
  'waitlist = invited from the waitlist. '
  'author = content author, granted admin access instead of complimentary premium. '
  'access_override = invited from User access overrides; carries a geo_access_overrides row as well as the complimentary months.';
