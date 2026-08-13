-- ============================================================
-- 026_content_modules_premium_rls.sql
--
-- Security fix: the "Authenticated users can read published content"
-- policy from 007_content_modules.sql only checks published_at — it
-- never checks `tier`. The £7.99/month premium paywall was enforced
-- exclusively in application code (src/app/api/content/route.ts and
-- the /learn pages filtering `.eq('tier', 'free')`).
--
-- That's not a real boundary: the app ships a fully-configured browser
-- Supabase client (src/lib/supabase/client.ts) using the public anon
-- key plus the user's own session. Any authenticated free-tier user
-- could bypass the UI entirely and read every premium article's
-- body_md straight from the REST API:
--
--   supabase.from('content_modules').select('body_md').eq('tier', 'premium')
--
-- Fix: move the tier check into RLS itself, so it holds no matter how
-- the table is queried — mirrors the is_admin() SECURITY DEFINER
-- pattern already established in 015_fix_admin_rls_recursion.sql.
-- ============================================================

-- Resolve whether the calling user is entitled to premium content:
-- either they actually pay for it, or they're an admin/author (Pamela
-- and the team need to review premium articles without a subscription
-- — same rule as src/lib/access.ts#getUserAccess on the app side).
--
-- SECURITY DEFINER + STABLE, same reasoning as public.is_admin():
-- this must read `profiles` without re-triggering RLS on profiles
-- (which would recurse back through this policy's own check).
CREATE OR REPLACE FUNCTION public.has_premium_access()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(
    (
      SELECT subscription_tier = 'premium' OR is_admin
      FROM public.profiles
      WHERE id = auth.uid()
    ),
    FALSE
  );
$$;

DROP POLICY IF EXISTS "Authenticated users can read published content" ON content_modules;

CREATE POLICY "Authenticated users can read accessible content"
  ON content_modules FOR SELECT
  TO authenticated
  USING (
    published_at IS NOT NULL
    AND published_at <= NOW()
    AND (tier = 'free' OR public.has_premium_access())
  );
