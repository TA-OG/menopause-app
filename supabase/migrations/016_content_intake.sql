-- ============================================================
-- 016_content_intake.sql
-- Pamela's guided content intake — the author-side questionnaire.
--
-- Pamela (low-tech domain expert) answers a plain-English set of
-- questions per topic in the admin back end. Those answers are the
-- raw material the team later converts into wellness frameworks.
--
-- Answers are keyed by (topic_id, question_id, round). The `round`
-- column lets a later round (e.g. the recorded Fathom interview)
-- coexist with this foundation round instead of overwriting it —
-- differing answers across rounds are signal, not conflict.
-- ============================================================

CREATE TABLE content_intake_responses (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  topic_id      TEXT NOT NULL,
  topic_label   TEXT NOT NULL,
  question_id   TEXT NOT NULL,
  question_text TEXT NOT NULL,
  answer        TEXT NOT NULL DEFAULT '',
  round         TEXT NOT NULL DEFAULT 'foundation',
  author_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One answer per question per topic per round; re-saving upserts.
  UNIQUE (topic_id, question_id, round)
);

ALTER TABLE content_intake_responses ENABLE ROW LEVEL SECURITY;

-- Author-only data. Only the service role (used by the admin tooling
-- behind the is_admin layout gate) may read or write it.
CREATE POLICY "Service role manages content intake"
  ON content_intake_responses FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

CREATE INDEX idx_content_intake_topic ON content_intake_responses(topic_id);
CREATE INDEX idx_content_intake_round ON content_intake_responses(round);

CREATE TRIGGER content_intake_responses_updated_at
  BEFORE UPDATE ON content_intake_responses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
