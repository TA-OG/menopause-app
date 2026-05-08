-- ============================================================
-- 002_menopause_profile.sql
-- Detailed intake: menopause_profiles + onboarding_answers
-- ============================================================

-- ─── MENOPAUSE PROFILES ──────────────────────────────────────────────────────

CREATE TABLE menopause_profiles (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  last_period_date      DATE,
  symptom_onset_date    DATE,
  confirmed_menopause   BOOLEAN NOT NULL DEFAULT FALSE,
  stage                 menopause_stage,
  primary_goal          TEXT,
  secondary_goals       TEXT[] NOT NULL DEFAULT '{}',
  previously_tried      TEXT[] NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

ALTER TABLE menopause_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own menopause profile"
  ON menopause_profiles FOR ALL
  USING (auth.uid() = user_id);

CREATE TRIGGER menopause_profiles_updated_at
  BEFORE UPDATE ON menopause_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER menopause_profiles_audit
  AFTER INSERT OR UPDATE OR DELETE ON menopause_profiles
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- ─── ONBOARDING ANSWERS ──────────────────────────────────────────────────────
-- Flexible Q&A store — one row per question/answer pair.
-- Allows Pamela to update intake questions without schema migrations.

CREATE TABLE onboarding_answers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  question_key    TEXT NOT NULL,    -- e.g. 'primary_symptom', 'hot_flash_frequency'
  answer_value    TEXT NOT NULL,    -- e.g. 'hot_flashes', '8_or_more'
  answered_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, question_key)   -- One answer per question per user
);

ALTER TABLE onboarding_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own onboarding answers"
  ON onboarding_answers FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX idx_onboarding_answers_user_id ON onboarding_answers(user_id);
CREATE INDEX idx_onboarding_answers_question_key ON onboarding_answers(question_key);
