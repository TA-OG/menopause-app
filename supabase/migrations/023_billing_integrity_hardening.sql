-- ============================================================
-- 023_billing_integrity_hardening.sql
--
-- Fixes two issues found while investigating "paid but still shown
-- as free tier":
--
-- 1. payment_events.processed_at was stamped at INSERT time, before
--    the webhook actually finished updating the user's profile. If
--    processing failed partway through (network blip, transient DB
--    error, unhandled exception in referral logic), the event was
--    already recorded as "seen" — so Stripe's automatic retry of the
--    same event got silently short-circuited as a duplicate and the
--    user's profile was NEVER updated, even though they were charged.
--    Fix: track real completion state via a `status` column, and only
--    treat an event as "done, skip retries" once processing actually
--    succeeds.
--
-- 2. profiles had no protection against a logged-in user updating
--    their OWN billing/privilege columns directly via the Supabase
--    client (subscription_tier, subscription_status, is_admin,
--    stripe_customer_id, stripe_subscription_id, referral_months_banked).
--    The "Users can update own profile" policy from 001_initial_schema.sql
--    has no WITH CHECK and no column restriction, so any authenticated
--    user could grant themselves premium (or admin) for free by calling
--    the Supabase REST API directly with their own session token —
--    entirely bypassing this app's UI and API routes. Fix: a trigger
--    that rejects changes to those columns unless the request is made
--    via the service role (i.e. our trusted server-side code).
-- ============================================================

-- ─── 1. payment_events: track real processing status ──────────────────────

ALTER TABLE payment_events
  ADD COLUMN status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'completed', 'failed')),
  ADD COLUMN error TEXT;

-- Rows that already exist predate this column. We can't know in hindsight
-- whether each one finished successfully, but they were inserted under the
-- old code path where the DB update ran immediately after — mark them
-- completed so a backfill doesn't cause a flood of reprocessing.
UPDATE payment_events SET status = 'completed';

CREATE INDEX idx_payment_events_status ON payment_events(status)
  WHERE status <> 'completed';

-- ─── 2. profiles: block client-side writes to billing/privilege columns ───

CREATE OR REPLACE FUNCTION public.protect_billing_columns()
RETURNS TRIGGER AS $$
BEGIN
  -- auth.role() is 'service_role' for requests made with the service-role
  -- key (our webhook / admin / trusted server routes), 'authenticated' for
  -- a normal logged-in user's own session, and 'anon' when unauthenticated.
  -- Only service_role may touch these columns.
  IF auth.role() = 'authenticated' THEN
    IF NEW.subscription_tier      IS DISTINCT FROM OLD.subscription_tier
    OR NEW.subscription_status    IS DISTINCT FROM OLD.subscription_status
    OR NEW.stripe_customer_id     IS DISTINCT FROM OLD.stripe_customer_id
    OR NEW.stripe_subscription_id IS DISTINCT FROM OLD.stripe_subscription_id
    OR NEW.is_admin                IS DISTINCT FROM OLD.is_admin
    OR NEW.referral_months_banked IS DISTINCT FROM OLD.referral_months_banked
    THEN
      RAISE EXCEPTION 'Direct updates to billing or privilege columns are not permitted'
        USING ERRCODE = '42501'; -- insufficient_privilege
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER protect_billing_columns_trigger
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_billing_columns();

-- ─── 3. Lock down the banked-months RPCs to service_role only ─────────────
-- These are SECURITY DEFINER (they bypass RLS by design, so the webhook can
-- adjust banked months for any user). Supabase grants EXECUTE on new
-- functions to PUBLIC by default, which would let any authenticated user
-- call them directly (e.g. via supabase.rpc(...)) to bank themselves
-- unlimited free months. They should only ever be called from trusted
-- server code using the service-role client.

REVOKE ALL ON FUNCTION increment_referral_months_banked(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION decrement_referral_months_banked(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION increment_referral_months_banked(UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION decrement_referral_months_banked(UUID, INTEGER) TO service_role;
