-- ============================================================
-- 013_fix_handle_new_user.sql
--
-- Fixes "Database error saving new user" on sign-up.
--
-- Root cause: handle_new_user() trigger lacks:
--   1. Explicit search_path (can fail to resolve public.profiles)
--   2. ON CONFLICT guard (crashes on duplicate uid)
--   3. Exception handling (any error silently kills auth)
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log the error but don't block auth — user can still sign in
  RAISE WARNING 'handle_new_user failed for uid %: % %', NEW.id, SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$$;
