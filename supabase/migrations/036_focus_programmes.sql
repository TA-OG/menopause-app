-- ============================================================
-- 036_focus_programmes.sql
-- One change a week, checked in daily.
--
-- A full plan is delivered all at once — up to 166 suggestions. The focus
-- programme turns it into a single change per week, chosen (by
-- src/lib/focus-programme.ts) for the 1–3 symptoms she wants to tackle first.
-- She checks in daily and reviews the week before the next change opens.
-- Design and agreed decisions: docs/focus-programme.md.
--
-- Three things:
--
--   1. focus_programmes — her focus symptoms and the programme's lifecycle.
--      At most one active programme per user, enforced by the database.
--
--   2. focus_weeks — one row per weekly change, with a snapshot of the wording
--      she was shown. The snapshot is for the record only ("what were you
--      asked to try in week 2?") and survives her plan being regenerated.
--      Cautions are NEVER read from it: they are re-derived from her current
--      answers at render time, as /my-plan already does.
--
--   3. record_focus_checkin() — the daily check-in write. It MERGES into
--      symptom_checkins rather than replacing the row, because the full
--      check-in form upserts the same (user_id, checkin_date) row and a plain
--      upsert of just her focus ratings would wipe every other symptom she had
--      already logged that day.
-- ============================================================

CREATE TYPE focus_programme_status AS ENUM ('active', 'ended');

-- kept    — she carries on with it; it stays on her daily check-in
-- stopped — she reviewed it and is not carrying on
-- swapped — she chose a different change before reviewing this one
CREATE TYPE focus_week_outcome AS ENUM ('kept', 'stopped', 'swapped');

-- CHECK constraints cannot contain subqueries, so "no duplicates" lives in an
-- IMMUTABLE helper. Pure function of its argument, so IMMUTABLE is truthful.
CREATE FUNCTION symptom_keys_are_distinct(keys symptom_key[])
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT cardinality(keys) = (SELECT count(DISTINCT k) FROM unnest(keys) AS k)
$$;

-- ─── Programmes ────────────────────────────────────────────────────────────
CREATE TABLE focus_programmes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- symptom_key (migration 006) rejects anything that is not a real symptom.
  -- 1–3 of them, no duplicates, and never the catch-all 'other', which no
  -- recommendation targets and so could never be matched.
  focus_symptoms  symptom_key[] NOT NULL,

  status          focus_programme_status NOT NULL DEFAULT 'active',
  -- Her LOCAL calendar date, supplied by the client (see localCalendarDate()
  -- in src/lib/checkin-schema.ts) — never derived from UTC.
  started_on      DATE NOT NULL,
  ended_at        TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT focus_symptoms_count CHECK (
    cardinality(focus_symptoms) BETWEEN 1 AND 3
  ),
  CONSTRAINT focus_symptoms_no_other CHECK (
    NOT ('other'::symptom_key = ANY (focus_symptoms))
  ),
  CONSTRAINT focus_symptoms_distinct CHECK (
    symptom_keys_are_distinct(focus_symptoms)
  ),
  -- An ended programme says when it ended; an active one has not.
  CONSTRAINT focus_programme_ended_consistent CHECK (
    (status = 'active') = (ended_at IS NULL)
  )
);

CREATE UNIQUE INDEX idx_focus_programmes_one_active
  ON focus_programmes(user_id)
  WHERE status = 'active';

ALTER TABLE focus_programmes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own focus programmes"
  ON focus_programmes FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER focus_programmes_updated_at
  BEFORE UPDATE ON focus_programmes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER focus_programmes_audit
  AFTER INSERT OR UPDATE OR DELETE ON focus_programmes
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- ─── Weeks ─────────────────────────────────────────────────────────────────
CREATE TABLE focus_weeks (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  programme_id             UUID NOT NULL REFERENCES focus_programmes(id) ON DELETE CASCADE,
  -- Denormalised so RLS is a plain equality, like every other user table.
  -- The policy below also checks it agrees with the programme's owner.
  user_id                  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- 1, 2, 3 … in the order the changes were started. A swap takes the next
  -- number, so the sequence is a complete history, not a week count.
  sequence                 SMALLINT NOT NULL CHECK (sequence >= 1),

  recommendation_id        TEXT NOT NULL,
  -- What she was shown: { title, body, category, targets_symptoms }.
  recommendation_snapshot  JSONB NOT NULL,
  -- Which of her focus symptoms this change was chosen for.
  covers_symptoms          symptom_key[] NOT NULL DEFAULT '{}',

  starts_on                DATE NOT NULL,
  outcome                  focus_week_outcome,
  reviewed_at              TIMESTAMPTZ,
  -- Set when she later drops a change she had kept.
  released_on              DATE,

  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (programme_id, sequence),
  CONSTRAINT focus_week_snapshot_is_object CHECK (
    jsonb_typeof(recommendation_snapshot) = 'object'
  ),
  CONSTRAINT focus_week_reviewed_consistent CHECK (
    (outcome IS NULL) = (reviewed_at IS NULL)
  ),
  -- Only a kept change can later be released.
  CONSTRAINT focus_week_release_needs_kept CHECK (
    released_on IS NULL OR outcome = 'kept'
  )
);

-- One open (unreviewed) week per programme. This is what makes "the next week
-- opens only after her review" a database guarantee rather than a UI habit.
CREATE UNIQUE INDEX idx_focus_weeks_one_open
  ON focus_weeks(programme_id)
  WHERE outcome IS NULL;

CREATE INDEX idx_focus_weeks_user ON focus_weeks(user_id);

ALTER TABLE focus_weeks ENABLE ROW LEVEL SECURITY;

-- The WITH CHECK also requires the programme to be hers, so a week can never
-- be attached to someone else's programme by guessing its id.
CREATE POLICY "Users can manage own focus weeks"
  ON focus_weeks FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM focus_programmes p
      WHERE p.id = programme_id AND p.user_id = auth.uid()
    )
  );

CREATE TRIGGER focus_weeks_updated_at
  BEFORE UPDATE ON focus_weeks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER focus_weeks_audit
  AFTER INSERT OR UPDATE OR DELETE ON focus_weeks
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- ─── Daily check-in: merge, never replace ──────────────────────────────────
--
-- p_symptoms   ratings for her focus symptoms, e.g. {"hot_flashes": 3}.
--              Merged key-by-key into the day's existing ratings.
-- p_done       recommendation ids she did today ("Yes").
-- p_not_done   ids she answered "Not today" — removed from tried_today, so a
--              mistaken "Yes" can be corrected the same day.
--
-- SECURITY INVOKER (the default), so symptom_checkins' RLS applies exactly as
-- it does to the existing check-in route. Validation is repeated here rather
-- than trusted to the API, because the function is callable directly.
CREATE OR REPLACE FUNCTION record_focus_checkin(
  p_checkin_date  DATE,
  p_symptoms      JSONB  DEFAULT '{}'::jsonb,
  p_done          TEXT[] DEFAULT '{}',
  p_not_done      TEXT[] DEFAULT '{}'
)
RETURNS symptom_checkins
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user  UUID := auth.uid();
  v_row   symptom_checkins;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  p_symptoms := COALESCE(p_symptoms, '{}'::jsonb);
  p_done     := COALESCE(p_done, '{}');
  p_not_done := COALESCE(p_not_done, '{}');

  IF jsonb_typeof(p_symptoms) <> 'object' THEN
    RAISE EXCEPTION 'symptoms must be an object' USING ERRCODE = '22023';
  END IF;

  -- Same contract as CheckinSchema: real symptom keys, whole numbers 1–5.
  IF EXISTS (
    SELECT 1 FROM jsonb_each(p_symptoms) AS e
    WHERE e.key NOT IN (SELECT unnest(enum_range(NULL::symptom_key))::text)
       OR jsonb_typeof(e.value) <> 'number'
       OR (e.value)::numeric NOT IN (1, 2, 3, 4, 5)
  ) THEN
    RAISE EXCEPTION 'invalid symptom rating' USING ERRCODE = '22023';
  END IF;

  -- The same id cannot be both done and not done in one answer.
  IF p_done && p_not_done THEN
    RAISE EXCEPTION 'an item cannot be both done and not done' USING ERRCODE = '22023';
  END IF;

  INSERT INTO symptom_checkins AS c (user_id, checkin_date, symptoms, tried_today)
  VALUES (
    v_user,
    p_checkin_date,
    p_symptoms,
    ARRAY(SELECT DISTINCT unnest(p_done) ORDER BY 1)
  )
  ON CONFLICT (user_id, checkin_date) DO UPDATE SET
    symptoms    = c.symptoms || EXCLUDED.symptoms,
    tried_today = ARRAY(
      SELECT DISTINCT t
      FROM unnest(c.tried_today || EXCLUDED.tried_today) AS t
      WHERE NOT (t = ANY (p_not_done))
      ORDER BY 1
    )
  RETURNING c.* INTO v_row;

  RETURN v_row;
END;
$$;

-- Supabase's default privileges grant EXECUTE on new public functions to anon
-- as well, so revoking from PUBLIC alone would leave it callable signed-out.
-- (It would still refuse — auth.uid() is NULL — but it should not be reachable.)
REVOKE ALL ON FUNCTION record_focus_checkin(DATE, JSONB, TEXT[], TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION record_focus_checkin(DATE, JSONB, TEXT[], TEXT[]) FROM anon;
GRANT EXECUTE ON FUNCTION record_focus_checkin(DATE, JSONB, TEXT[], TEXT[]) TO authenticated;
