-- ============================================================
-- 008_payments.sql
-- Payment events log for Stripe webhook audit trail
-- ============================================================

CREATE TABLE payment_events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stripe_event_id TEXT NOT NULL UNIQUE,
  event_type      TEXT NOT NULL,
  user_id         UUID REFERENCES profiles(id),
  data            JSONB NOT NULL DEFAULT '{}',
  processed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Payment events are append-only — no RLS access for users
ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct user access to payment events"
  ON payment_events FOR ALL
  USING (FALSE);

CREATE INDEX idx_payment_events_user ON payment_events(user_id);
CREATE INDEX idx_payment_events_type ON payment_events(event_type);
