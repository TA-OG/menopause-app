-- ============================================================
-- 031_admin_invites.sql
--
-- Audit log of every invite sent from the admin panel, together with the
-- outcome of the complimentary premium grant that now accompanies it.
--
-- Why a dedicated table rather than reusing waitlist_signups:
--   1. waitlist_signups.converted_to_user is a single boolean. It records
--      THAT someone was invited, but not when, by which admin, or whether
--      their complimentary premium actually landed.
--   2. Author invites (/api/admin/invite-author) have no waitlist row at
--      all, so there is nowhere to record them today.
--   3. A grant can partially fail: the Supabase invite email is sent first
--      and cannot be un-sent, so a subsequent Stripe failure leaves the
--      person invited but WITHOUT their 12 months. That state has to be
--      visible and auditable — otherwise an invited woman quietly hits a
--      paywall she was told she would not see, and nobody knows why.
--
-- Service-role only, the same shape as waitlist_signups (028),
-- payment_events (008) and app_events (019): the admin UI reads this
-- through createAdminClient(), never the user-scoped client.
-- ============================================================

CREATE TABLE admin_invites (
  id                        UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  email                     TEXT        NOT NULL,
  first_name                TEXT,

  -- The waitlist row this invite came from, when it came from one.
  -- NULL for author invites, which have no waitlist entry.
  waitlist_id               UUID        REFERENCES waitlist_signups(id) ON DELETE SET NULL,
  user_id                   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_by                UUID        REFERENCES auth.users(id) ON DELETE SET NULL,

  invite_kind               TEXT        NOT NULL DEFAULT 'waitlist'
                                        CHECK (invite_kind IN ('waitlist', 'author')),

  -- TRUE when the person already had an account, so Supabase sent no new
  -- invite email. Not a failure — recorded so the log explains itself.
  already_registered        BOOLEAN     NOT NULL DEFAULT FALSE,

  complimentary_status      TEXT        NOT NULL DEFAULT 'not_attempted'
                                        CHECK (complimentary_status IN (
                                          'granted',
                                          'already_subscribed',
                                          'failed',
                                          'not_attempted'
                                        )),
  complimentary_months      INTEGER,
  complimentary_expires_at  TIMESTAMPTZ,
  stripe_subscription_id    TEXT,
  error                     TEXT,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE admin_invites IS
  'Audit log of invites sent from the admin panel, including whether the complimentary premium grant succeeded.';

COMMENT ON COLUMN admin_invites.complimentary_status IS
  'granted = complimentary premium is active. '
  'already_subscribed = left untouched, the user already had a live Stripe subscription. '
  'failed = the invite was sent but complimentary premium did NOT apply (see error column) — needs manual follow-up. '
  'not_attempted = no grant was tried for this invite.';

CREATE INDEX idx_admin_invites_created_at ON admin_invites (created_at DESC);
CREATE INDEX idx_admin_invites_email ON admin_invites (LOWER(email));

-- Partial index: the only status we ever need to hunt for is the one that
-- needs a human to intervene.
CREATE INDEX idx_admin_invites_failed ON admin_invites (created_at DESC)
  WHERE complimentary_status = 'failed';

ALTER TABLE admin_invites ENABLE ROW LEVEL SECURITY;

-- No policies: service-role only (service_role bypasses RLS entirely).
-- Supabase's default table grants would otherwise hand anon/authenticated
-- full CRUD at creation time, and RLS alone does not revoke a grant — it
-- only adds a row check if the grant already lets the operation through.
-- Revoke outright, same defence-in-depth reasoning as 028.
REVOKE ALL ON admin_invites FROM anon, authenticated;
