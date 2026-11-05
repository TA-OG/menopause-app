-- ============================================================
-- 039_reminder_kind_checkin_nudge.sql
-- Adds 'checkin_nudge' to reminder_kind.
--
-- The notifications cron now sends a once-a-day "how are you feeling
-- today?" prompt that links to /symptom-checkin, alongside the existing
-- plan_drip. It is logged to notification_log under its own kind so the two
-- don't share a once-per-day claim (a plan drip sent today must not stop
-- the check-in prompt, or vice versa).
--
-- Kept on its own: a value added with ALTER TYPE ... ADD VALUE cannot be
-- referenced in the same transaction, so the unique index that uses it is
-- in 040.
-- ============================================================

ALTER TYPE reminder_kind ADD VALUE IF NOT EXISTS 'checkin_nudge';
