-- ============================================================
-- 030_notification_log_local_date.sql
-- Database-backed once-per-local-day guarantee for notification_log.
--
-- Two related bugs in the 029 plan-drip cron, found by CodeRabbit review:
--
--   1. The cron's idempotency check compared a user's local calendar date
--      against a UTC midnight boundary (`${local.date}T00:00:00Z`). For any
--      timezone with a non-zero UTC offset this is simply the wrong
--      instant — e.g. a user in Pacific/Auckland (+12) whose local send
--      time falls at 20:00 UTC the previous day would never match the
--      `gte` filter, so overlapping ticks in the same local hour could
--      both send; a user in America/Los_Angeles (-7) whose send time falls
--      after UTC midnight could be seen as "already sent today" on the
--      following local day and only receive a drip every other day.
--
--   2. Even with the read fixed, the log row is only written *after* the
--      push send succeeds — two overlapping or retried cron ticks (the
--      route is designed to run every ~15 minutes) can both pass the read
--      check before either has written its row, and both send.
--
-- Fixing the read alone doesn't close the race; the guarantee has to live
-- in the database. This adds the actual local calendar date the
-- notification was sent on, and a unique index enforcing at most one
-- plan_drip per user per local day — the cron now inserts this row to
-- *claim* the day before sending, and a 23505 unique-violation on that
-- insert means another tick already claimed it, so this tick skips
-- sending instead of risking a duplicate.
-- ============================================================

ALTER TABLE notification_log
  ADD COLUMN IF NOT EXISTS local_date DATE;

COMMENT ON COLUMN notification_log.local_date IS
  'Calendar date (in the recipient''s own timezone) this notification was '
  'sent on. Populated at insert time by the sender, which already knows '
  'the user''s local date — never derived from sent_at after the fact, '
  'since that requires re-resolving the user''s timezone at read time.';

-- Partial: only plan_drip is meant to be at-most-once-per-day today.
-- hydration/movement/etc are interval reminders (reminder_schedules) that
-- are expected to fire multiple times in the same local day.
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_log_unique_daily
  ON notification_log(user_id, kind, local_date)
  WHERE kind = 'plan_drip' AND local_date IS NOT NULL;
