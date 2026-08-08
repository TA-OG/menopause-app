-- ============================================================
-- 021_referral_reward_notifications.sql
-- Tracks whether a user has been shown the in-app "you earned a
-- free month" banner for a given referral reward, so it appears
-- exactly once per reward rather than on every page load.
-- ============================================================

ALTER TABLE referral_rewards
  ADD COLUMN notified_at TIMESTAMPTZ;

CREATE INDEX idx_referral_rewards_unnotified
  ON referral_rewards(user_id)
  WHERE status = 'applied' AND notified_at IS NULL;
