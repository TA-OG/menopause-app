-- ============================================================
-- 028_notification_schedules.sql
-- Drip-feed and interval reminder infrastructure.
--
-- Numbered 028, not 025: this was authored in a sandboxed checkout whose
-- migrations directory only went up to 024, so it was originally created as
-- 025. The real project database already has unrelated 025/026/027
-- migrations (EU geo-restrictions, content-module premium RLS, rate
-- limits) applied. Renumbered to the next free slot rather than colliding.
--
-- Foundation for turning the wellness plan into scheduled push reminders.
-- Three things:
--
--   1. user_preferences.timezone — the existing notification_hour column
--      (migration 003) has never had a timezone to be local to. The cron
--      route reads it but the hour is meaningless without one.
--
--   2. reminder_schedules — one row per reminder category a user has
--      configured (hydration, a specific supplement, daily plan tip, etc).
--      Supports BOTH shapes a user might want:
--        - "every N minutes, between these hours" (interval_minutes + a
--          window) — e.g. water every 2 hours from 8am-8pm
--        - "at these specific times" (times array) — e.g. a supplement at
--          8am and 8pm
--      Exactly one of interval_minutes or times is set; enforced by a
--      check constraint rather than left to application code, since a row
--      that set both would leave the sender needing to guess which wins.
--
--   3. notification_log — records what was actually sent and when, so the
--      cron job can (a) rotate through plan items without repeating one
--      before the others have had a turn, and (b) never double-send if a
--      run overlaps or retries. Append-only from the app's perspective.
--
-- All three carry RLS matching the existing user_preferences pattern:
-- users manage their own rows, service role (the cron job) manages all.
-- ============================================================

ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS timezone TEXT;

COMMENT ON COLUMN user_preferences.timezone IS
  'IANA timezone name (e.g. "Europe/London"). notification_hour is local to '
  'this. NULL means the user has not set one yet — cron must skip rather than '
  'guess UTC, since a random guess could fire a reminder at 3am for someone.';

CREATE TYPE reminder_kind AS ENUM (
  'plan_drip',   -- rotates through the user's wellness plan, one item per fire
  'hydration',
  'nutrition',
  'supplement',
  'movement',
  'custom'
);

CREATE TABLE reminder_schedules (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind              reminder_kind NOT NULL,
  label             TEXT NOT NULL,          -- user-facing name, e.g. "Water"
  enabled           BOOLEAN NOT NULL DEFAULT TRUE,

  -- Interval mode: fire every N minutes within [window_start, window_end).
  interval_minutes  INT CHECK (interval_minutes IS NULL OR interval_minutes >= 15),
  window_start      TIME,
  window_end        TIME,

  -- Fixed-times mode: fire at each specific local time of day.
  times             TIME[],

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Exactly one mode. Interval mode also needs both window bounds, or "every
  -- N minutes" has no start or no end to bound it.
  CONSTRAINT reminder_schedule_exactly_one_mode CHECK (
    (interval_minutes IS NOT NULL AND window_start IS NOT NULL AND window_end IS NOT NULL AND times IS NULL)
    OR
    (interval_minutes IS NULL AND window_start IS NULL AND window_end IS NULL AND times IS NOT NULL AND array_length(times, 1) > 0)
  )
);

ALTER TABLE reminder_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own reminder schedules"
  ON reminder_schedules FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages reminder schedules"
  ON reminder_schedules FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

CREATE INDEX idx_reminder_schedules_user ON reminder_schedules(user_id);
CREATE INDEX idx_reminder_schedules_enabled ON reminder_schedules(user_id) WHERE enabled = TRUE;

CREATE TRIGGER reminder_schedules_updated_at
  BEFORE UPDATE ON reminder_schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ────────────────────────────────────────────────────────────

CREATE TABLE notification_log (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  schedule_id       UUID REFERENCES reminder_schedules(id) ON DELETE SET NULL,
  kind              reminder_kind NOT NULL,
  -- Which plan recommendation this fire surfaced, for plan_drip rotation.
  -- NULL for non-drip kinds (hydration/movement reminders aren't tied to a
  -- specific recommendation id).
  recommendation_id TEXT,
  sent_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notification log"
  ON notification_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages notification log"
  ON notification_log FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

-- Drives "what hasn't this user seen recently" (plan_drip rotation) and
-- "did this schedule already fire in this tick" (idempotency) lookups.
CREATE INDEX idx_notification_log_user_kind_sent ON notification_log(user_id, kind, sent_at DESC);
CREATE INDEX idx_notification_log_schedule_sent ON notification_log(schedule_id, sent_at DESC) WHERE schedule_id IS NOT NULL;
