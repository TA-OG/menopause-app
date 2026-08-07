-- ============================================================
-- 017_referrals.sql
-- In-app referral program for authenticated users.
--
-- Mechanic: a user shares their referral code/link. When the
-- referred friend makes their first successful subscription
-- payment, BOTH the referrer and the referred friend are granted
-- one free month. Referrers can stack rewards from up to 6
-- qualifying referrals (lifetime cap of 6 free months earned via
-- referrals). The referred friend's own one-off bonus is separate
-- from — and not limited by — the referrer's cap.
-- ============================================================

-- ─── PROFILES: referral code + banked credit ──────────────────────────────

ALTER TABLE profiles
  ADD COLUMN referral_code TEXT UNIQUE,
  ADD COLUMN referral_months_banked INTEGER NOT NULL DEFAULT 0
    CHECK (referral_months_banked >= 0);

CREATE INDEX idx_profiles_referral_code ON profiles(referral_code);

COMMENT ON COLUMN profiles.referral_months_banked IS
  'Free months earned via referrals that have not yet been applied to a Stripe subscription because the user has no active subscription yet. Consumed as trial_period_days on their next checkout.';

-- ─── REFERRALS ──────────────────────────────────────────────────────────────
-- One row per referred user. referred_id is UNIQUE so a given account
-- can only ever be "the referred friend" once, for life — this is the
-- primary abuse guard (no re-claiming, no multi-referrer double-counting).

CREATE TABLE referrals (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  referrer_id             UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  referred_id             UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  referral_code_used      TEXT NOT NULL,
  status                  TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'qualified', 'expired')),
  qualified_at            TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT referrals_no_self_referral CHECK (referrer_id <> referred_id)
);

CREATE INDEX idx_referrals_referrer ON referrals(referrer_id);
CREATE INDEX idx_referrals_status ON referrals(status);

CREATE TRIGGER referrals_updated_at
  BEFORE UPDATE ON referrals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

-- Users can see referrals they're party to (as referrer or as the referred
-- friend). All writes go through the service role (webhook / auth callback).
CREATE POLICY "Users can view own referrals"
  ON referrals FOR SELECT
  USING (auth.uid() = referrer_id OR auth.uid() = referred_id);

-- ─── REFERRAL REWARDS (ledger) ───────────────────────────────────────────────
-- Append-only ledger of free-month grants. One row per (referral, role) —
-- the unique constraint is what makes reward-granting idempotent against
-- Stripe webhook retries.

CREATE TABLE referral_rewards (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  referral_id       UUID NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role              TEXT NOT NULL CHECK (role IN ('referrer', 'referred')),
  months            INTEGER NOT NULL DEFAULT 1 CHECK (months > 0),
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'applied', 'failed')),
  application_method TEXT,             -- 'stripe_trial_extension' | 'banked_credit'
  applied_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT referral_rewards_one_per_role UNIQUE (referral_id, role)
);

CREATE INDEX idx_referral_rewards_user ON referral_rewards(user_id);

ALTER TABLE referral_rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own referral rewards"
  ON referral_rewards FOR SELECT
  USING (auth.uid() = user_id);

-- ─── Atomic banked-credit helpers ────────────────────────────────────────────
-- Single UPDATE statements so concurrent grants/redemptions (e.g. two
-- referrals qualifying for the same un-subscribed user at nearly the same
-- time) can't lose an update via a read-modify-write race.

CREATE OR REPLACE FUNCTION increment_referral_months_banked(p_user_id UUID, p_months INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE profiles
  SET referral_months_banked = referral_months_banked + p_months
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION decrement_referral_months_banked(p_user_id UUID, p_months INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE profiles
  SET referral_months_banked = GREATEST(0, referral_months_banked - p_months)
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Lifetime cap enforcement note ───────────────────────────────────────────
-- The 6-month stacking cap (referrer role only — the referred friend's
-- single bonus is never capped) is enforced in application code
-- (src/lib/referral-rewards.ts) by summing referral_rewards.months
-- for role = 'referrer' before granting a new one. It is not a DB
-- constraint because it depends on reading the running total, not a
-- single row.
