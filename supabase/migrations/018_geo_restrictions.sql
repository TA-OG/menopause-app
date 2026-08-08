-- ============================================================
-- 018_geo_restrictions.sql
-- Per-jurisdiction availability control + per-user overrides.
--
-- Mirrors the proven My Maternity Friend pattern. Lets an admin control,
-- per country, how Aunty Mel behaves:
--
--   disabled   — country blocked entirely; user sees a "not available in
--                your region yet" notice.
--   info_only  — app accessible and educational content (Learn articles)
--                works, but the PERSONALISED wellness plan is withheld.
--                This is the compliant "light" mode for high-regulation
--                jurisdictions where individualised guidance is restricted.
--   full       — all features available, including the personalised plan.
--
-- The user's jurisdiction comes from profiles.country (ISO 3166-1 alpha-2,
-- already captured at onboarding / checkout).
-- ============================================================

-- ---------------------------------------------------------------------------
-- geo_restrictions — one row per known country, admin-managed.
-- ---------------------------------------------------------------------------

CREATE TABLE geo_restrictions (
  country_code  TEXT        PRIMARY KEY,                  -- ISO 3166-1 alpha-2, e.g. "GB"
  country_name  TEXT        NOT NULL,
  mode          TEXT        NOT NULL DEFAULT 'disabled'
                            CHECK (mode IN ('disabled', 'info_only', 'full')),
  enabled       BOOLEAN     NOT NULL DEFAULT FALSE,       -- kept in sync: enabled = (mode <> 'disabled')
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON COLUMN geo_restrictions.mode IS
  'disabled = blocked, user sees unavailable notice. '
  'info_only = app + Learn articles available, personalised wellness plan withheld (high-compliance jurisdictions). '
  'full = all features including personalised plan.';

-- Seed known jurisdictions. Everything defaults to disabled — the admin
-- explicitly opens each market. GB is the launch market and goes live.
INSERT INTO geo_restrictions (country_code, country_name, mode, enabled) VALUES
  ('GB', 'United Kingdom',        'full',     TRUE),
  ('IE', 'Ireland',               'disabled', FALSE),
  ('US', 'United States',         'disabled', FALSE),
  ('CA', 'Canada',                'disabled', FALSE),
  ('AU', 'Australia',             'disabled', FALSE),
  ('NZ', 'New Zealand',           'disabled', FALSE),
  ('FR', 'France',                'disabled', FALSE),
  ('DE', 'Germany',               'disabled', FALSE),
  ('ES', 'Spain',                 'disabled', FALSE),
  ('IT', 'Italy',                 'disabled', FALSE),
  ('NL', 'Netherlands',           'disabled', FALSE),
  ('SE', 'Sweden',                'disabled', FALSE),
  ('NO', 'Norway',                'disabled', FALSE),
  ('DK', 'Denmark',               'disabled', FALSE),
  ('CH', 'Switzerland',           'disabled', FALSE),
  ('AE', 'United Arab Emirates',  'disabled', FALSE),
  ('ZA', 'South Africa',          'disabled', FALSE),
  ('NG', 'Nigeria',               'disabled', FALSE),
  ('KE', 'Kenya',                 'disabled', FALSE),
  ('GH', 'Ghana',                 'disabled', FALSE),
  ('UG', 'Uganda',                'disabled', FALSE),
  ('ZM', 'Zambia',                'disabled', FALSE),
  ('IN', 'India',                 'disabled', FALSE),
  ('SG', 'Singapore',             'disabled', FALSE)
ON CONFLICT (country_code) DO NOTHING;

-- RLS: readable by any authenticated user (the app checks its own access);
-- mutations only via the service-role admin API.
ALTER TABLE geo_restrictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read geo restrictions"
  ON geo_restrictions FOR SELECT
  TO authenticated
  USING (TRUE);

-- No write policy — admin API uses the service-role client (bypasses RLS).

-- ---------------------------------------------------------------------------
-- geo_access_overrides — grant a specific user full access regardless of
-- their country (internal testers, beta pilots, the content team).
-- ---------------------------------------------------------------------------

CREATE TABLE geo_access_overrides (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  reason      TEXT,
  expires_at  TIMESTAMPTZ,                                -- NULL = never expires
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)                                        -- one override per user
);

COMMENT ON TABLE geo_access_overrides IS
  'Per-user bypass granting full access regardless of detected country. Testers and beta pilots.';

ALTER TABLE geo_access_overrides ENABLE ROW LEVEL SECURITY;

-- A user may read their own override (so a client check works without service role).
CREATE POLICY "Users can read own geo override"
  ON geo_access_overrides FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Admin reads/writes all overrides via the service-role client.

CREATE INDEX idx_geo_access_overrides_user_id ON geo_access_overrides (user_id);
