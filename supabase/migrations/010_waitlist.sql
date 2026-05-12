-- ============================================================
-- 010_waitlist.sql
-- Waitlist signups with referral tracking
-- ============================================================

CREATE TABLE waitlist_signups (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email                 TEXT NOT NULL UNIQUE,
  first_name            TEXT NOT NULL,
  primary_symptom       TEXT,                        -- Optional pre-launch research
  referral_code         TEXT NOT NULL UNIQUE,         -- Their own shareable code
  referred_by_code      TEXT,                         -- Code used when they signed up
  referred_by_id        UUID REFERENCES waitlist_signups(id),
  referral_count        INTEGER NOT NULL DEFAULT 0,   -- How many they've referred
  priority_access       BOOLEAN NOT NULL DEFAULT FALSE, -- True if referred by someone
  stripe_coupon_id      TEXT,                         -- Created when they subscribe
  converted_to_user     BOOLEAN NOT NULL DEFAULT FALSE,
  converted_at          TIMESTAMPTZ,
  ip_address            TEXT,                         -- Basic fraud prevention
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- No RLS — this is public-facing, managed via service role only
-- Direct user access not permitted
CREATE INDEX idx_waitlist_referral_code ON waitlist_signups(referral_code);
CREATE INDEX idx_waitlist_referred_by ON waitlist_signups(referred_by_id);
CREATE INDEX idx_waitlist_email ON waitlist_signups(email);
CREATE INDEX idx_waitlist_created ON waitlist_signups(created_at DESC);

CREATE TRIGGER waitlist_updated_at
  BEFORE UPDATE ON waitlist_signups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
