-- ============================================================
-- 024_wellness_plans_cultural_context_column.sql
-- Restore wellness_plans.cultural_context in production.
--
-- The column was added to 005_wellness_plans.sql by editing that file
-- AFTER it had already been applied to production (see commit ca79b49,
-- 2026-05-12). Editing an already-run migration never gets replayed, so
-- the column existed in the repo but never in the live database. Every
-- POST /api/wellness-plan since has failed with PGRST204 ("Could not
-- find the 'cultural_context' column of 'wellness_plans' in the schema
-- cache"), silently breaking plan generation for every user.
--
-- IF NOT EXISTS makes this safe to run even if a given environment
-- somehow already has the column (e.g. local/staging dbs created fresh
-- from the current migrations directory).
-- ============================================================

ALTER TABLE wellness_plans
  ADD COLUMN IF NOT EXISTS cultural_context JSONB;

-- PostgREST caches the schema and only reloads on DDL events it detects
-- automatically in most cases, but issue an explicit reload so this takes
-- effect immediately rather than waiting on the next auto-detected change.
NOTIFY pgrst, 'reload schema';
