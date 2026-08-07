-- ============================================================
-- 019_app_events.sql
-- Lightweight, self-hosted application monitoring ("mini-Sentry").
--
-- One row per observed event. Two kinds:
--
--   request — every API request the app handles, with status + duration.
--             Powers latency (avg / p95) and error-rate calculations.
--   error   — a captured failure with detail (message + stack). Comes from
--             server route catch-blocks, uncaught server exceptions, and the
--             client global-error boundary.
--
-- Why our own table instead of reading Vercel logs: Vercel runtime logs are
-- ephemeral (retained ~1h on Hobby) and have no queryable history API. Writing
-- our own events means we own the data indefinitely and can aggregate it in
-- the admin dashboard. Per product decision, events are kept indefinitely
-- (no auto-pruning) — revisit with a retention job if the table grows large.
--
-- Access: service-role only. RLS is enabled with NO policies, so the table is
-- unreadable/unwritable except via the admin (service-role) client used by the
-- monitoring lib and the admin metrics API.
-- ============================================================

CREATE TABLE app_events (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  type        TEXT        NOT NULL CHECK (type IN ('request', 'error')),
  level       TEXT        NOT NULL DEFAULT 'info'
                          CHECK (level IN ('info', 'warning', 'error')),
  source      TEXT        NOT NULL DEFAULT 'server'
                          CHECK (source IN ('server', 'client')),
  route       TEXT,                       -- e.g. /api/journal or /my-plan
  method      TEXT,                       -- GET / POST / ...
  status      INTEGER,                    -- HTTP status code
  duration_ms INTEGER,                    -- handler duration (request events)
  message     TEXT,                       -- error message / short label
  stack       TEXT,                       -- server stack / client component stack
  digest      TEXT,                       -- Next.js error digest (groups identical errors)
  user_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  user_agent  TEXT,
  meta        JSONB,                      -- free-form extra context
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE app_events IS
  'Self-hosted app monitoring events (requests + errors). Service-role access only.';

-- Dashboard query patterns: newest-first feeds, type-filtered windows,
-- and per-route latency aggregation.
CREATE INDEX idx_app_events_created_at      ON app_events (created_at DESC);
CREATE INDEX idx_app_events_type_created_at ON app_events (type, created_at DESC);
CREATE INDEX idx_app_events_route           ON app_events (route);

-- RLS on, no policies → only the service-role client can touch this table.
ALTER TABLE app_events ENABLE ROW LEVEL SECURITY;
