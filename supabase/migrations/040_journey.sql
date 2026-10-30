-- ============================================================
-- 040_journey.sql
-- "Your path back to you": her journey, and what she tells Mel each day.
--
-- The rules live in src/lib/journey.ts. This holds only what she chose and
-- answered, so the rules can change without rewriting anyone's history.
--
--   journeys      one row per woman: the focus she chose with Mel and the
--                 day she started. Day 1–7 is Feel Safe; Foundations runs on
--                 the focus programme (039); nothing about stages is stored.
--
--   journey_days  one row per day she answered: how she feels this morning,
--                 and her answer to the Feel Safe invitation open that day.
--                 Upserted by the API, so a second tap the same day replaces
--                 that day's answer rather than adding a row.
--
-- Both are hers alone under RLS. Her morning feeling is health data (UK GDPR
-- Art. 9), held on the same basis as symptom_checkins.
-- ============================================================

CREATE TABLE journeys (
  user_id      UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  -- FOCUS_AREAS in src/lib/journey.ts. Listed here too so a typo in a client
  -- cannot store an area the app does not know.
  focus_area   TEXT NOT NULL CHECK (focus_area IN (
                 'rest', 'calmer', 'myself_again', 'less_alone', 'cooler',
                 'energy', 'clearer_head', 'comfortable_body', 'intimacy', 'skin_hair'
               )),
  -- Her LOCAL calendar date, from the client (as focus_programmes.started_on).
  started_on   DATE NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE journeys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own journey"
  ON journeys FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER journeys_updated_at
  BEFORE UPDATE ON journeys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- audit_trigger_fn() records NEW.id; journeys is keyed by user_id, so it has
-- no `id` column and is audited through journey_days and the API's events.

CREATE TYPE journey_feeling AS ENUM ('good', 'up_and_down', 'hard');
CREATE TYPE journey_invitation_outcome AS ENUM ('done', 'not_today');

CREATE TABLE journey_days (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  day                 DATE NOT NULL,
  feeling             journey_feeling,
  -- FEEL_SAFE_INVITATIONS ids in src/lib/journey-copy.ts.
  invitation_id       TEXT CHECK (invitation_id IN ('feel_safe_1', 'feel_safe_2', 'feel_safe_3')),
  invitation_outcome  journey_invitation_outcome,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, day),
  -- An answer always says which invitation it answers, and vice versa.
  CONSTRAINT journey_day_invitation_consistent CHECK (
    (invitation_id IS NULL) = (invitation_outcome IS NULL)
  ),
  -- A row with nothing in it is not an answer.
  CONSTRAINT journey_day_not_empty CHECK (
    feeling IS NOT NULL OR invitation_id IS NOT NULL
  )
);

CREATE INDEX idx_journey_days_user_day ON journey_days(user_id, day DESC);

ALTER TABLE journey_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own journey days"
  ON journey_days FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER journey_days_updated_at
  BEFORE UPDATE ON journey_days
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER journey_days_audit
  AFTER INSERT OR UPDATE OR DELETE ON journey_days
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
