-- ============================================================
-- 027_rate_limits.sql
--
-- Security fix: src/lib/rate-limit.ts previously kept its counters in a
-- module-level JS Map. That works for a single long-lived Node process
-- (local dev) but provides ZERO protection on Vercel serverless, where
-- each invocation can land on a fresh process with an empty Map — every
-- `/api/waitlist`, `/api/push/subscribe`, `/api/stripe/create-checkout`,
-- and admin-route rate limit was silently a no-op in production despite
-- looking enforced in the code.
--
-- Fix: move the counter into Postgres, which is already the one piece of
-- shared state every serverless invocation can reach. A single atomic
-- INSERT .. ON CONFLICT .. DO UPDATE per check avoids the read-then-write
-- race a naive SELECT+UPDATE would have under concurrent requests hitting
-- the same key.
-- ============================================================

CREATE TABLE rate_limits (
  -- e.g. "203.0.113.4:/api/waitlist" — same "ip:pathname" key shape the
  -- old in-memory limiter used, so behaviour per-route is unchanged.
  key       TEXT PRIMARY KEY,
  count     INT NOT NULL DEFAULT 1,
  reset_at  TIMESTAMPTZ NOT NULL
);

-- RLS enabled with no policies for anon/authenticated — same "service-role
-- only" pattern as app_events (019_app_events.sql). Only check_rate_limit()
-- (SECURITY DEFINER, granted to service_role below) touches this table;
-- there is no legitimate reason for a client-held session to read or write
-- rate-limit counters directly.
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Atomically check-and-increment the counter for `p_key`, resetting it if
-- the window has elapsed. Returns whether this request is allowed and how
-- many requests remain in the current window.
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key       TEXT,
  p_limit     INT,
  p_window_ms INT
)
RETURNS TABLE(allowed BOOLEAN, remaining INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now      TIMESTAMPTZ := clock_timestamp();
  v_window   INTERVAL := make_interval(secs => p_window_ms / 1000.0);
  v_count    INT;
  v_reset_at TIMESTAMPTZ;
BEGIN
  -- ON CONFLICT DO UPDATE takes a row-level lock on the existing row before
  -- this session's UPDATE applies, so two concurrent requests for the same
  -- key can't both read stale `count` and both "win" the last slot.
  INSERT INTO rate_limits AS rl (key, count, reset_at)
  VALUES (p_key, 1, v_now + v_window)
  ON CONFLICT (key) DO UPDATE SET
    count    = CASE WHEN rl.reset_at <= v_now THEN 1 ELSE rl.count + 1 END,
    reset_at = CASE WHEN rl.reset_at <= v_now THEN v_now + v_window ELSE rl.reset_at END
  RETURNING rl.count, rl.reset_at INTO v_count, v_reset_at;

  -- Opportunistic cleanup instead of a separate cron job: on roughly 1 in
  -- 200 calls, sweep rows whose window expired over an hour ago. Keeps the
  -- table bounded (distinct IP×route keys would otherwise grow forever)
  -- without adding a DELETE to every single request.
  IF random() < 0.005 THEN
    DELETE FROM rate_limits WHERE reset_at < v_now - INTERVAL '1 hour';
  END IF;

  RETURN QUERY SELECT (v_count <= p_limit), GREATEST(p_limit - v_count, 0);
END;
$$;

-- Supabase grants EXECUTE on new functions to PUBLIC by default (same trap
-- documented in 023_billing_integrity_hardening.sql for the referral RPCs).
-- Lock this down to service_role — only our trusted server-side rate-limit
-- helper (src/lib/rate-limit.ts, via the admin client) should call it.
REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INT, INT) TO service_role;
