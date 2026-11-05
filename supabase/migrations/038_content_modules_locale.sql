-- ============================================================
-- 038_content_modules_locale.sql
--
-- Adds locale support to Learn articles. Translations of the same article
-- share a `slug` (the stable cross-locale identifier) and are distinguished
-- by `locale` — so the old UNIQUE(slug) becomes UNIQUE(slug, locale).
-- Existing rows default to 'en', matching the English-only content authored
-- so far. The RLS policy from 026_content_modules_premium_rls.sql checks
-- only published_at/tier, not slug, so it needs no changes.
-- ============================================================

ALTER TABLE content_modules ADD COLUMN locale TEXT NOT NULL DEFAULT 'en';

ALTER TABLE content_modules DROP CONSTRAINT content_modules_slug_key;
ALTER TABLE content_modules ADD CONSTRAINT content_modules_slug_locale_key UNIQUE (slug, locale);
