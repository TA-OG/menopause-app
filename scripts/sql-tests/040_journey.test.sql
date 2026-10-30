-- Behaviour tests for 040_journey.sql: constraints and RLS.
-- Every line prints PASS, or the run stops. Run with scripts/sql-tests/run.sh
-- (after 039's tests, which create the two test users and expect_fail()).
\set ON_ERROR_STOP 1

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001',false);

-- journeys
INSERT INTO journeys (user_id, focus_area, started_on) VALUES (auth.uid(), 'rest', '2026-11-01');
SELECT 'PASS: journey started';
SELECT expect_fail('second journey for the same woman', $$INSERT INTO journeys (user_id, focus_area, started_on) VALUES (auth.uid(), 'calmer', '2026-11-02')$$);
SELECT expect_fail('unknown focus area', $$UPDATE journeys SET focus_area = 'sleep' WHERE user_id = auth.uid()$$);
SELECT expect_fail('journey for another user', $$INSERT INTO journeys (user_id, focus_area, started_on) VALUES ('bbbbbbbb-0000-0000-0000-000000000002', 'rest', '2026-11-01')$$);
UPDATE journeys SET focus_area = 'calmer' WHERE user_id = auth.uid();
SELECT 'PASS: focus can change';

-- days
INSERT INTO journey_days (user_id, day, feeling) VALUES (auth.uid(), '2026-11-01', 'hard');
SELECT 'PASS: morning feeling saved';
INSERT INTO journey_days (user_id, day, feeling, invitation_id, invitation_outcome)
VALUES (auth.uid(), '2026-11-01', 'up_and_down', 'feel_safe_1', 'done')
ON CONFLICT (user_id, day) DO UPDATE SET
  feeling = EXCLUDED.feeling,
  invitation_id = EXCLUDED.invitation_id,
  invitation_outcome = EXCLUDED.invitation_outcome;
SELECT CASE WHEN (SELECT count(*) FROM journey_days WHERE user_id = auth.uid()) = 1
            AND (SELECT feeling FROM journey_days WHERE day = '2026-11-01') = 'up_and_down'
       THEN 'PASS: same day replaces, never duplicates' ELSE 'FAIL: same day duplicated' END;
SELECT expect_fail('answer without its invitation', $$INSERT INTO journey_days (user_id, day, invitation_outcome) VALUES (auth.uid(), '2026-11-02', 'done')$$);
SELECT expect_fail('invitation without an answer', $$INSERT INTO journey_days (user_id, day, invitation_id) VALUES (auth.uid(), '2026-11-02', 'feel_safe_1')$$);
SELECT expect_fail('unknown invitation', $$INSERT INTO journey_days (user_id, day, invitation_id, invitation_outcome) VALUES (auth.uid(), '2026-11-02', 'feel_safe_9', 'done')$$);
SELECT expect_fail('unknown feeling', $$INSERT INTO journey_days (user_id, day, feeling) VALUES (auth.uid(), '2026-11-02', 'fine')$$);
SELECT expect_fail('empty day', $$INSERT INTO journey_days (user_id, day) VALUES (auth.uid(), '2026-11-02')$$);
SELECT expect_fail('day for another user', $$INSERT INTO journey_days (user_id, day, feeling) VALUES ('bbbbbbbb-0000-0000-0000-000000000002', '2026-11-02', 'good')$$);

-- B sees nothing of A's
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-0000-0000-0000-000000000002',false);
SELECT CASE WHEN (SELECT count(*) FROM journeys) = 0 THEN 'PASS: B sees none of A''s journey' ELSE 'FAIL: B sees A''s journey' END;
SELECT CASE WHEN (SELECT count(*) FROM journey_days) = 0 THEN 'PASS: B sees none of A''s days' ELSE 'FAIL: B sees A''s days' END;
UPDATE journey_days SET feeling = 'good';
RESET ROLE;
SELECT CASE WHEN (SELECT feeling FROM journey_days WHERE day = '2026-11-01') = 'up_and_down'
       THEN 'PASS: B cannot change A''s day' ELSE 'FAIL: B changed A''s day' END;

-- deleting her account takes her journey with it
DELETE FROM profiles WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT CASE WHEN (SELECT count(*) FROM journeys) = 0 AND (SELECT count(*) FROM journey_days) = 0
       THEN 'PASS: account deletion removes her journey' ELSE 'FAIL: journey survived account deletion' END;
