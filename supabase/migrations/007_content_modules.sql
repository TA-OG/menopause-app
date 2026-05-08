-- ============================================================
-- 007_content_modules.sql
-- Pamela's content library — articles + admin role
-- ============================================================

CREATE TYPE content_tier AS ENUM ('free', 'premium');

CREATE TABLE content_modules (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug                      TEXT NOT NULL UNIQUE,
  title                     TEXT NOT NULL,
  body_md                   TEXT NOT NULL DEFAULT '',
  tier                      content_tier NOT NULL DEFAULT 'free',
  category                  TEXT NOT NULL,
  tags                      TEXT[] NOT NULL DEFAULT '{}',
  estimated_read_minutes    SMALLINT,
  published_at              TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE content_modules ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read published content
-- Free content visible to all; premium gated in application layer
CREATE POLICY "Authenticated users can read published content"
  ON content_modules FOR SELECT
  TO authenticated
  USING (published_at IS NOT NULL AND published_at <= NOW());

-- Only service role can insert/update content (via admin page)
CREATE POLICY "Service role manages content"
  ON content_modules FOR ALL
  TO service_role
  USING (TRUE);

CREATE INDEX idx_content_modules_tier ON content_modules(tier);
CREATE INDEX idx_content_modules_category ON content_modules(category);
CREATE INDEX idx_content_modules_published ON content_modules(published_at DESC)
  WHERE published_at IS NOT NULL;

CREATE TRIGGER content_modules_updated_at
  BEFORE UPDATE ON content_modules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
