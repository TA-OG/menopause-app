-- ============================================================
-- 012_admin.sql
-- Admin role support
--
-- Adds is_admin flag to profiles. Admins can read all profiles
-- (needed for future admin dashboard) while normal RLS still
-- applies to non-admin users.
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- Allow admins to read any profile (own-profile policy still covers normal users)
CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.is_admin = TRUE
    )
  );

-- Allow admins to update any profile (for admin tooling / support)
CREATE POLICY "Admins can update all profiles"
  ON profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.is_admin = TRUE
    )
  );
