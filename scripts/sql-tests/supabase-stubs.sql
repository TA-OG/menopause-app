-- Minimal stand-ins for what Supabase provides, so migrations can be tested
-- against a plain Postgres. NOT a migration — never apply this to Supabase.
--
--   auth.uid()            reads request.jwt.claim.sub, as Supabase's does
--   anon / authenticated  the two API roles RLS is written for
--   profiles, audit_logs, update_updated_at, audit_trigger_fn, symptom_key,
--   symptom_checkins      copied from migrations 001, 004 and 006
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
CREATE FUNCTION uuid_generate_v4() RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;
CREATE TABLE profiles (id uuid PRIMARY KEY);
CREATE TABLE audit_logs (id bigserial, table_name text, record_id text, action text, performed_by uuid, old_data jsonb, new_data jsonb);
-- verbatim from 001
CREATE OR REPLACE FUNCTION update_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
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
CREATE TYPE symptom_key AS ENUM (
  'hot_flashes', 'night_sweats', 'sleep_problems', 'mood_changes',
  'anxiety', 'brain_fog', 'weight_changes', 'joint_pain',
  'low_libido', 'fatigue', 'vaginal_dryness', 'skin_changes',
  'hair_changes', 'other'
);
CREATE TABLE symptom_checkins (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  checkin_date      DATE NOT NULL,
  -- Symptom severities — JSONB keyed by SymptomKey, value 1-5
  symptoms          JSONB NOT NULL DEFAULT '{}',
  severity_overall  SMALLINT CHECK (severity_overall >= 1 AND severity_overall <= 5),
  mood_score        SMALLINT CHECK (mood_score >= 1 AND mood_score <= 5),
  energy_level      SMALLINT CHECK (energy_level >= 1 AND energy_level <= 5),
  sleep_hours       NUMERIC(3,1) CHECK (sleep_hours >= 0 AND sleep_hours <= 24),
  -- Lifestyle tracking — what they actioned from their plan today
  tried_today       TEXT[] NOT NULL DEFAULT '{}',   -- array of plan recommendation IDs
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, checkin_date)
);

ALTER TABLE symptom_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own checkins"
  ON symptom_checkins FOR ALL
  USING (auth.uid() = user_id);

CREATE TRIGGER symptom_checkins_updated_at BEFORE UPDATE ON symptom_checkins FOR EACH ROW EXECUTE FUNCTION update_updated_at();
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated;
