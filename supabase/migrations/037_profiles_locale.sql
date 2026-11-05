-- ============================================================
-- 037_profiles_locale.sql
--
-- Adds a persisted language preference for signed-in users, mirroring
-- the existing `country CHAR(2)` column style (001_initial_schema.sql).
-- Populated by onboarding (LocationStep), the LanguageSwitcher, or synced
-- from the NEXT_LOCALE cookie on sign-in. Defaults to 'en' so existing
-- rows don't need a backfill.
-- ============================================================

ALTER TABLE profiles ADD COLUMN locale TEXT NOT NULL DEFAULT 'en';
