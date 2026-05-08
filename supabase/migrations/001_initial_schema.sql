-- ============================================================
-- 001_initial_schema.sql
-- Core tables: profiles, audit_logs
-- Auth trigger: auto-create profile on sign-up
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── ENUMS ───────────────────────────────────────────────────────────────────

CREATE TYPE subscription_tier AS ENUM ('free', 'premium');
CREATE TYPE subscription_status AS ENUM ('active', 'cancelled', 'past_due', 'trialing');
CREATE TYPE menopause_stage AS ENUM ('perimenopause', 'menopause', 'postmenopause', 'surgical', 'unsure');

-- ─── PROFILES ────────────────────────────────────────────────────────────────

CREATE TABLE profiles (
  id                      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name               TEXT,
  avatar_url              TEXT,
  onboarding_complete     BOOLEAN NOT NULL DEFAULT FALSE,
  subscription_tier       subscription_tier NOT NULL DEFAULT 'free',
  subscription_status     subscription_status,
  stripe_customer_id      TEXT UNIQUE,
  stripe_subscription_id  TEXT UNIQUE,
  menopause_stage         menopause_stage,
  date_of_birth           DATE,
  country                 CHAR(2),                    -- ISO 3166-1 alpha-2
  currency                CHAR(3) DEFAULT 'gbp',      -- ISO 4217
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Auto-create profile on sign-up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── AUDIT LOGS ──────────────────────────────────────────────────────────────

CREATE TABLE audit_logs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_name    TEXT NOT NULL,
  record_id     TEXT NOT NULL,
  action        TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  performed_by  UUID REFERENCES auth.users(id),
  old_data      JSONB,
  new_data      JSONB,
  timestamp     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit logs are append-only — no update or delete for anyone
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct access to audit logs"
  ON audit_logs FOR ALL
  USING (FALSE);

-- Audit trigger function
CREATE OR REPLACE FUNCTION audit_trigger_fn()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (table_name, record_id, action, performed_by, new_data)
    VALUES (TG_TABLE_NAME, NEW.id::TEXT, 'INSERT', auth.uid(), to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs (table_name, record_id, action, performed_by, old_data, new_data)
    VALUES (TG_TABLE_NAME, NEW.id::TEXT, 'UPDATE', auth.uid(), to_jsonb(OLD), to_jsonb(NEW));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_logs (table_name, record_id, action, performed_by, old_data)
    VALUES (TG_TABLE_NAME, OLD.id::TEXT, 'DELETE', auth.uid(), to_jsonb(OLD));
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
