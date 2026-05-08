-- ============================================================
-- 004_symptom_checkins.sql
-- Daily symptom + lifestyle tracking log
-- ============================================================

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

CREATE INDEX idx_symptom_checkins_user_date
  ON symptom_checkins(user_id, checkin_date DESC);

CREATE TRIGGER symptom_checkins_updated_at
  BEFORE UPDATE ON symptom_checkins
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER symptom_checkins_audit
  AFTER INSERT OR UPDATE OR DELETE ON symptom_checkins
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
