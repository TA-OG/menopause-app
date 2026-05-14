-- ============================================================
-- 015_fix_admin_rls_recursion.sql
--
-- Fix: "infinite recursion detected in policy for relation profiles"
--
-- Root cause: the admin RLS policies on `profiles` contain a subquery
-- that SELECTs from `profiles` — Postgres evaluates the policy for
-- EVERY row accessed, including the subquery row, causing infinite
-- recursion.
--
-- Solution: move the admin check into a SECURITY DEFINER function.
-- SECURITY DEFINER bypasses RLS, so the function can safely read the
-- profiles table without triggering the policy evaluation loop.
-- ============================================================

-- Step 1: Create a stable, RLS-exempt admin-check function
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM public.profiles WHERE id = auth.uid()),
    FALSE
  );
$$;

-- Step 2: Drop the recursive policies from migration 012
DROP POLICY IF EXISTS "Admins can view all profiles"   ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;

-- Step 3: Recreate using the safe function — no more self-reference
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admins can update all profiles"
  ON public.profiles FOR UPDATE
  USING (public.is_admin());
