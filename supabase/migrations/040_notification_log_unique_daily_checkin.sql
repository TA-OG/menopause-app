-- ============================================================
-- 040_notification_log_unique_daily_checkin.sql
-- Once-per-local-day guarantee for checkin_nudge.
--
-- Same mechanism as 030 for plan_drip: the cron inserts the notification_log
-- row to claim the user's local day *before* sending, and a 23505 on that
-- insert means a concurrent or retried tick already claimed it.
--
-- A separate partial index rather than widening 030's: migrations here are
-- append-only, and dropping/recreating the plan_drip index would briefly
-- leave plan_drip unprotected.
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_log_unique_daily_checkin
  ON notification_log(user_id, kind, local_date)
  WHERE kind = 'checkin_nudge' AND local_date IS NOT NULL;
