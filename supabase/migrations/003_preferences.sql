-- ============================================================
-- 003_preferences.sql
-- User preferences + lifestyle data
-- ============================================================

CREATE TYPE exercise_level AS ENUM ('very_active', 'moderately_active', 'lightly_active', 'not_active', 'limited');
CREATE TYPE diet_type AS ENUM ('whole_foods', 'mixed', 'convenience', 'specific', 'unaware');
CREATE TYPE stress_level AS ENUM ('low', 'moderate', 'high', 'very_high');
CREATE TYPE sleep_quality AS ENUM ('good', 'fair', 'poor', 'very_poor');
CREATE TYPE alcohol_frequency AS ENUM ('never', 'occasionally', 'weekly', 'daily');
CREATE TYPE smoking_status AS ENUM ('never', 'ex_smoker', 'current');

CREATE TABLE user_preferences (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                 UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  diet_type               diet_type,
  exercise_level          exercise_level,
  stress_level            stress_level,
  sleep_quality           sleep_quality,
  alcohol_frequency       alcohol_frequency,
  smoking_status          smoking_status,
  notification_hour       SMALLINT CHECK (notification_hour >= 0 AND notification_hour <= 23),
  notification_enabled    BOOLEAN NOT NULL DEFAULT FALSE,
  feature_usage           JSONB NOT NULL DEFAULT '{}',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own preferences"
  ON user_preferences FOR ALL
  USING (auth.uid() = user_id);

CREATE TRIGGER user_preferences_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
