-- ============================================================
-- 041_account_erasure.sql
-- Self-service account deletion: make it possible, and make it complete.
--
-- The data-deletion page has told users they can delete their account from
-- their profile. That feature didn't exist, and building it exposed two
-- problems in the schema:
--
--   1. Deleting a user could not succeed. audit_logs.performed_by (001) and
--      payment_events.user_id (008) reference the user with no ON DELETE
--      action, so removing anyone who had ever checked in, or had a Stripe
--      event, raised a foreign-key violation.
--
--   2. Deleting a user would not erase their health data. audit_trigger_fn
--      (001) copies the full row (to_jsonb) into audit_logs on every insert,
--      update and delete of menopause_profiles, symptom_checkins and
--      wellness_plans. A cascade delete of those rows would itself write
--      fresh full copies into audit_logs, so her symptoms, check-ins and
--      plan would outlive her account indefinitely.
--
-- This migration:
--   - repoints both foreign keys to ON DELETE SET NULL, so the rows that must
--     be kept (payment records, under UK tax law; audit entries for actions
--     an admin took) survive without a link to the person;
--   - adds erase_user(), which does the whole erasure in one transaction:
--     anonymises her waitlist and admin-invite rows (matched by email, the
--     only link they have), deletes the auth user (cascading to profiles and
--     every table that references it), and deletes every audit_logs row that
--     carries her data — including the ones the cascade itself just wrote.
--
-- Stripe is handled by the API route before this runs, so a deleted account
-- is never left with a live subscription still charging her.
-- ============================================================

-- ─── 1. Foreign keys that blocked deletion ────────────────────────────────────
-- Constraint names are looked up rather than assumed, so this works whatever
-- Postgres auto-named them when 001/008 ran.

DO $$
DECLARE
  con TEXT;
BEGIN
  SELECT c.conname INTO con
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
  WHERE c.conrelid = 'public.audit_logs'::regclass
    AND c.contype = 'f'
    AND a.attname = 'performed_by';
  IF con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.audit_logs DROP CONSTRAINT %I', con);
  END IF;

  SELECT c.conname INTO con
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
  WHERE c.conrelid = 'public.payment_events'::regclass
    AND c.contype = 'f'
    AND a.attname = 'user_id';
  IF con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.payment_events DROP CONSTRAINT %I', con);
  END IF;
END $$;

ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_performed_by_fkey
  FOREIGN KEY (performed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.payment_events
  ADD CONSTRAINT payment_events_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ─── 2. erase_user() ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.erase_user(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email TEXT;
  v_uid   TEXT := p_user_id::TEXT;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'erase_user: no user %', p_user_id USING ERRCODE = 'P0002';
  END IF;

  -- Rows linked only by email. Anonymised rather than deleted:
  -- waitlist_signups.referred_by_id points at other waitlist rows with no
  -- ON DELETE action, so deleting a referrer's row would fail; admin_invites
  -- is the admin panel's invite log, whose counts should stay accurate.
  IF v_email IS NOT NULL THEN
    UPDATE waitlist_signups
       SET email           = 'erased-' || id || '@erased.invalid',
           first_name      = 'Erased',
           primary_symptom = NULL,
           ip_address      = NULL
     WHERE LOWER(email) = LOWER(v_email);

    UPDATE admin_invites
       SET email      = 'erased-' || id || '@erased.invalid',
           first_name = NULL
     WHERE LOWER(email) = LOWER(v_email);
  END IF;

  -- Cascades through profiles to every user table (check-ins, journal,
  -- plans, onboarding answers, preferences, push subscriptions, reminders,
  -- referrals, geo overrides), and sets the remaining references to NULL
  -- (payment_events, app_events, audit_logs.performed_by, admin_invites).
  DELETE FROM auth.users WHERE id = p_user_id;

  -- Last, so it also catches the DELETE rows the cascade above just wrote
  -- through audit_trigger_fn / journal_audit_fn. Every audited table carries
  -- user_id; performed_by covers anything she did herself.
  DELETE FROM audit_logs
   WHERE performed_by = p_user_id
      OR old_data ->> 'user_id' = v_uid
      OR new_data ->> 'user_id' = v_uid;
END;
$$;

COMMENT ON FUNCTION public.erase_user(UUID) IS
  'Permanently deletes a user and all of their personal data in one transaction. '
  'Service role only — called by DELETE /api/account after Stripe has been cancelled.';

-- SECURITY DEFINER runs with the owner's rights, so who may call it is the
-- whole of its security. Functions are executable by PUBLIC by default:
-- without these lines any signed-in user could erase any other account.
REVOKE ALL ON FUNCTION public.erase_user(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.erase_user(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.erase_user(UUID) TO service_role;
