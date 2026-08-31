-- ============================================================
-- 034_admin_invites_email_delivery.sql
--
-- Records whether an invite email actually reached the invitee.
--
-- admin_invites already carried `already_registered`, and 031 documented what
-- it really meant: "TRUE when the person already had an account, so Supabase
-- sent no new invite email." That fact was true, recorded, and then not acted
-- on anywhere — the admin panel still reported "Invited ✓" for those rows, and
-- the only hint was a grey "existing" chip whose tooltip nobody opens.
--
-- So the log could not answer the one question that matters when someone says
-- "I never got my invite": did we send her anything at all? A boolean about
-- her account's prior existence is not that answer. This column is.
--
-- Historical rows are backfilled below from what they do tell us, and rows
-- written before this migration that we genuinely cannot classify are left as
-- 'unknown' rather than being guessed into looking successful.
-- ============================================================

ALTER TABLE admin_invites
  ADD COLUMN IF NOT EXISTS email_status TEXT NOT NULL DEFAULT 'unknown';

ALTER TABLE admin_invites
  DROP CONSTRAINT IF EXISTS admin_invites_email_status_check;

ALTER TABLE admin_invites
  ADD CONSTRAINT admin_invites_email_status_check
  CHECK (email_status IN (
    'invite_sent',
    'magic_link_sent',
    'not_sent',
    'unknown'
  ));

COMMENT ON COLUMN admin_invites.email_status IS
  'invite_sent = Supabase sent its invite email to a brand-new account. '
  'magic_link_sent = the account already existed, so a fresh magic link was emailed via Resend. '
  'not_sent = NOTHING reached the invitee — see email_error; needs a human. '
  'unknown = row predates delivery tracking (migration 034).';

ALTER TABLE admin_invites
  ADD COLUMN IF NOT EXISTS email_error TEXT;

COMMENT ON COLUMN admin_invites.email_error IS
  'Why no email reached the invitee. NULL unless email_status = ''not_sent''.';

-- Backfill what the existing rows can prove on their own.
--
-- already_registered = TRUE is the case this whole change is about: Supabase
-- rejected the invite for those and sent nothing, so they are 'not_sent'
-- rather than 'unknown'. These are the people to re-invite once deployed.
UPDATE admin_invites
   SET email_status = 'not_sent',
       email_error  = COALESCE(
         email_error,
         'No email was sent: the account already existed, and Supabase rejects inviteUserByEmail for an existing user. Re-invite to send a sign-in link.'
       )
 WHERE already_registered = TRUE
   AND email_status = 'unknown';

-- Everything else went out as an ordinary Supabase invite: a row only got
-- written at all once the invite call had returned without error.
UPDATE admin_invites
   SET email_status = 'invite_sent'
 WHERE already_registered = FALSE
   AND email_status = 'unknown';

-- The dashboard's headline query is "who did not get an email", so index that
-- case alone — it stays tiny however many invites accumulate.
CREATE INDEX IF NOT EXISTS idx_admin_invites_email_not_sent
  ON admin_invites (created_at DESC)
  WHERE email_status = 'not_sent';
