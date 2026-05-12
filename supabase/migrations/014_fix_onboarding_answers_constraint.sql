-- ============================================================
-- 014_fix_onboarding_answers_constraint.sql
--
-- Fix: UNIQUE (user_id, question_key) prevents array-type answers
-- (symptoms, heritage, previously_tried) from storing more than
-- one selection per question.
--
-- Solution: replace with UNIQUE (user_id, question_key, answer_value)
-- so each distinct value can coexist as its own row.
-- ============================================================

-- Drop the old one-answer-per-question constraint
ALTER TABLE onboarding_answers
  DROP CONSTRAINT IF EXISTS onboarding_answers_user_id_question_key_key;

-- Add new constraint: one row per (user, question, value)
-- This allows e.g. 5 symptom rows all with question_key='symptoms'
-- while still preventing exact duplicate entries.
CREATE UNIQUE INDEX IF NOT EXISTS onboarding_answers_user_question_value_key
  ON onboarding_answers (user_id, question_key, answer_value);
