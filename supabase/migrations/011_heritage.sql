-- ============================================================
-- 011_heritage.sql
-- Cultural heritage / background field on user preferences
-- Used to contextualise wellness recommendations
-- ============================================================

-- Add heritage as an array — women may have mixed backgrounds
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS heritage TEXT[] NOT NULL DEFAULT '{}';

-- Add heritage to onboarding answers is handled by the flexible
-- onboarding_answers table (question_key='heritage', answer_value=each selection)
-- No schema change needed there.

COMMENT ON COLUMN user_preferences.heritage IS
  'Cultural/heritage background(s) selected during onboarding. '
  'Multi-select. Used to contextualise wellness recommendations with '
  'culturally relevant food examples and symptom awareness. '
  'Never used to make assumptions — always layered on top of base recommendations.';
