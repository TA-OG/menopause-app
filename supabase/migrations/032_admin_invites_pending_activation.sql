-- ============================================================
-- 032_admin_invites_pending_activation.sql
--
-- Moves the complimentary premium clock from invite time to first sign-in.
--
-- Granting at invite time started the 12 months before the woman had an
-- account she could use: someone who took three months to accept an invite
-- silently received nine months of actual access, not twelve. It also created
-- a real Stripe customer and subscription for every invitee, including those
-- who never accepted at all.
--
-- The grant is now deferred. An invite records the INTENT
-- ('pending_activation'), and the grant itself runs the first time that user
-- signs in — so the 12 months always mean twelve months of usable access, and
-- no Stripe object is created for an invite nobody accepted.
--
-- Two new states are therefore needed:
--   pending_activation — invited, grant deferred until they first sign in
--   activating         — a sign-in is running the grant right now
--
-- 'activating' exists to make the claim atomic: the sign-in callback moves the
-- row pending_activation -> activating with a conditional UPDATE, so two
-- concurrent sign-ins cannot both run the grant. A row left stuck in
-- 'activating' (process killed mid-grant) stays visible in the dashboard
-- rather than disappearing into a silent failure.
-- ============================================================

ALTER TABLE admin_invites
  DROP CONSTRAINT IF EXISTS admin_invites_complimentary_status_check;

ALTER TABLE admin_invites
  ADD CONSTRAINT admin_invites_complimentary_status_check
  CHECK (complimentary_status IN (
    'pending_activation',
    'activating',
    'granted',
    'already_subscribed',
    'failed',
    'not_attempted'
  ));

COMMENT ON COLUMN admin_invites.complimentary_status IS
  'pending_activation = invited; the complimentary months start when they first sign in. '
  'activating = a sign-in is running the grant right now. '
  'granted = complimentary premium is active. '
  'already_subscribed = left untouched, the user already had a live Stripe subscription. '
  'failed = the grant did NOT apply (see error column) — needs manual follow-up. '
  'not_attempted = no grant was tried for this invite (author invites, which get access via is_admin).';

-- When the deferred grant actually ran, i.e. when the 12 months started.
-- NULL while the invite is still awaiting first sign-in.
ALTER TABLE admin_invites
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;

COMMENT ON COLUMN admin_invites.activated_at IS
  'When the deferred complimentary grant ran (first sign-in). NULL while still awaiting activation.';

-- The sign-in callback looks for a pending row on every login, so this lookup
-- has to be cheap. Partial index: only rows still awaiting or mid-activation
-- are ever queried this way, which keeps the index tiny regardless of how many
-- invites accumulate.
CREATE INDEX IF NOT EXISTS idx_admin_invites_pending_user
  ON admin_invites (user_id)
  WHERE complimentary_status IN ('pending_activation', 'activating');
