-- ============================================================
-- 042_schedule_checkin_reminders.sql
-- Schedules the daily check-in reminder.
--
-- GET /api/cron/notifications sends each opted-in user one "How are you
-- feeling today?" push at their own notification_hour, in their own
-- timezone. Nothing called it: it needs a caller at least once an hour so
-- every user's local hour is hit. This uses pg_cron + pg_net to call it
-- every 15 minutes from the database.
--
-- Why every 15 minutes rather than hourly: a tick that fails before a user's
-- day is claimed (deploy in progress, cold start timeout) is retried by the
-- next tick within the same hour. Double-sends are impossible either way —
-- the route claims each user's local day in notification_log before sending,
-- guarded by a unique index (migration 040).
--
-- Secrets are NOT in this file. Before this job can work, store two values
-- in Supabase Vault (SQL editor, once per project):
--
--   select vault.create_secret('https://auntymel.app', 'app_url');
--   select vault.create_secret('<the CRON_SECRET env var on Vercel>', 'cron_secret');
--
-- Until both exist the job runs but does nothing useful: with no app_url
-- the URL is NULL and no request is made; with no cron_secret the request
-- carries no valid token and the route rejects it with 401 (it fails closed
-- on a missing or wrong secret). Check net._http_response for status codes.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- cron.schedule with an existing job name replaces that job, so re-running
-- this migration is safe.
SELECT cron.schedule(
  'daily-checkin-reminders',
  '*/15 * * * *',
  $job$
  SELECT net.http_get(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'app_url')
           || '/api/cron/notifications',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    -- pg_net's default is 2s; the route loops over every opted-in user.
    timeout_milliseconds := 60000
  );
  $job$
);
