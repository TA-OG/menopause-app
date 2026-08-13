-- ============================================================
-- 028_waitlist_signups_rls.sql
--
-- CRITICAL fix, found via get_advisors while applying 026/027: RLS was
-- never enabled on waitlist_signups (010_waitlist.sql left a comment
-- saying "No RLS — managed via service role only / Direct user access
-- not permitted", but never actually enforced that). Supabase's default
-- grants gave `anon` — the public key shipped in every browser bundle —
-- full SELECT, INSERT, UPDATE, DELETE and TRUNCATE on the table.
--
-- In practice this meant anyone, with no login and no app involvement,
-- could:
--   - dump every signup's email, first name, IP address and referral/
--     coupon data straight from the REST API, or
--   - forge priority_access / referral_count, or
--   - delete or truncate the entire waitlist.
--
-- Every read/write of this table in the app already goes through
-- createAdminClient() (src/app/api/waitlist/route.ts, src/app/admin/page.tsx,
-- src/app/api/admin/invite/route.ts) — never the user-scoped client — so
-- locking this down to service_role only matches how the app actually
-- uses the table today; nothing depends on the anon/authenticated grants
-- this migration removes.
-- ============================================================

ALTER TABLE waitlist_signups ENABLE ROW LEVEL SECURITY;

-- No policies for anon/authenticated — same "service-role only" shape as
-- payment_events (008) and app_events (019). service_role bypasses RLS
-- entirely, so createAdminClient() call sites are unaffected.

-- Supabase's default table grants gave anon/authenticated full CRUD
-- (INSERT/SELECT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER) at table
-- creation time in 010_waitlist.sql — RLS alone doesn't revoke those,
-- it just adds a row-level check IF the grant already lets the
-- operation through. Revoke the grants outright so there's no privilege
-- left to exercise even if RLS were ever misconfigured later (defence
-- in depth, not just a policy check).
REVOKE ALL ON waitlist_signups FROM anon, authenticated;
