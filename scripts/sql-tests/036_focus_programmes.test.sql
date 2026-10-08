-- Behaviour tests for 036_focus_programmes.sql: constraints, RLS, and the
-- merge-not-replace daily check-in. Every line prints PASS, or the run stops.
-- Run with scripts/sql-tests/run.sh.
\set ON_ERROR_STOP 1
-- helper: statement must fail (runs with the caller's privileges)
CREATE FUNCTION public.expect_fail(label text, stmt text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE stmt; EXCEPTION WHEN OTHERS THEN RETURN 'PASS (rejected): ' || label || ' -> ' || SQLERRM; END;
  RAISE EXCEPTION 'FAIL: % was accepted', label;
END $$;
GRANT EXECUTE ON FUNCTION public.expect_fail(text,text) TO authenticated, anon;
INSERT INTO profiles VALUES ('aaaaaaaa-0000-0000-0000-000000000001'), ('bbbbbbbb-0000-0000-0000-000000000002');

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001',false);

INSERT INTO focus_programmes (id,user_id,focus_symptoms,started_on)
VALUES ('11111111-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','{hot_flashes,sleep_problems}','2026-10-08');
SELECT 'PASS: valid programme inserted';

SELECT expect_fail('4 symptoms', $$INSERT INTO focus_programmes (user_id,focus_symptoms,started_on,status,ended_at) VALUES (auth.uid(),'{hot_flashes,anxiety,fatigue,brain_fog}','2026-10-08','ended',now())$$);
SELECT expect_fail('0 symptoms', $$INSERT INTO focus_programmes (user_id,focus_symptoms,started_on,status,ended_at) VALUES (auth.uid(),'{}','2026-10-08','ended',now())$$);
SELECT expect_fail('duplicate symptom', $$INSERT INTO focus_programmes (user_id,focus_symptoms,started_on,status,ended_at) VALUES (auth.uid(),'{anxiety,anxiety}','2026-10-08','ended',now())$$);
SELECT expect_fail('other', $$INSERT INTO focus_programmes (user_id,focus_symptoms,started_on,status,ended_at) VALUES (auth.uid(),'{other}','2026-10-08','ended',now())$$);
SELECT expect_fail('unknown symptom', $$INSERT INTO focus_programmes (user_id,focus_symptoms,started_on,status,ended_at) VALUES (auth.uid(),'{headache}','2026-10-08','ended',now())$$);
SELECT expect_fail('second active programme', $$INSERT INTO focus_programmes (user_id,focus_symptoms,started_on) VALUES (auth.uid(),'{anxiety}','2026-10-08')$$);
SELECT expect_fail('ended without ended_at', $$INSERT INTO focus_programmes (user_id,focus_symptoms,started_on,status) VALUES (auth.uid(),'{anxiety}','2026-10-08','ended')$$);
SELECT expect_fail('programme for another user', $$INSERT INTO focus_programmes (user_id,focus_symptoms,started_on) VALUES ('bbbbbbbb-0000-0000-0000-000000000002','{anxiety}','2026-10-08')$$);
INSERT INTO focus_programmes (user_id,focus_symptoms,started_on,status,ended_at) VALUES (auth.uid(),'{anxiety}','2026-09-01','ended',now());
SELECT 'PASS: ended programme alongside active one allowed';

-- weeks
INSERT INTO focus_weeks (programme_id,user_id,sequence,recommendation_id,recommendation_snapshot,covers_symptoms,starts_on)
VALUES ('11111111-0000-0000-0000-000000000001',auth.uid(),1,'lf_circadian_light','{"title":"t"}','{sleep_problems}','2026-10-08');
SELECT 'PASS: week 1 inserted';
SELECT expect_fail('second open week', $$INSERT INTO focus_weeks (programme_id,user_id,sequence,recommendation_id,recommendation_snapshot,starts_on) VALUES ('11111111-0000-0000-0000-000000000001',auth.uid(),2,'x','{}','2026-10-15')$$);
SELECT expect_fail('duplicate sequence', $$INSERT INTO focus_weeks (programme_id,user_id,sequence,recommendation_id,recommendation_snapshot,starts_on,outcome,reviewed_at) VALUES ('11111111-0000-0000-0000-000000000001',auth.uid(),1,'x','{}','2026-10-15','kept',now())$$);
SELECT expect_fail('outcome without reviewed_at', $$UPDATE focus_weeks SET outcome='kept' WHERE sequence=1$$);
SELECT expect_fail('snapshot not an object', $$UPDATE focus_weeks SET recommendation_snapshot='[]' WHERE sequence=1$$);
SELECT expect_fail('release a stopped week', $$UPDATE focus_weeks SET outcome='stopped', reviewed_at=now(), released_on='2026-10-20' WHERE sequence=1$$);
UPDATE focus_weeks SET outcome='kept', reviewed_at=now() WHERE sequence=1;
INSERT INTO focus_weeks (programme_id,user_id,sequence,recommendation_id,recommendation_snapshot,starts_on) VALUES ('11111111-0000-0000-0000-000000000001',auth.uid(),2,'df_hydration_protocol','{}','2026-10-15');
SELECT 'PASS: week 2 opens after week 1 reviewed';

-- daily check-in merge
INSERT INTO symptom_checkins (user_id,checkin_date,symptoms,mood_score,notes) VALUES (auth.uid(),'2026-10-08','{"hot_flashes":4,"anxiety":2}',3,'full form');
SELECT symptoms, tried_today FROM record_focus_checkin('2026-10-08','{"hot_flashes":3}','{lf_circadian_light}');
SELECT CASE WHEN symptoms='{"hot_flashes":3,"anxiety":2}'::jsonb AND tried_today='{lf_circadian_light}' AND mood_score=3 AND notes='full form'
  THEN 'PASS: merge kept other symptoms, mood and notes' ELSE 'FAIL: merge '||symptoms::text END
  FROM symptom_checkins WHERE checkin_date='2026-10-08';
SELECT tried_today FROM record_focus_checkin('2026-10-08','{}','{df_hydration_protocol}','{lf_circadian_light}');
SELECT CASE WHEN tried_today='{df_hydration_protocol}' THEN 'PASS: Not today removes a mistaken Yes' ELSE 'FAIL: '||tried_today::text END FROM symptom_checkins WHERE checkin_date='2026-10-08';
SELECT tried_today FROM record_focus_checkin('2026-10-08','{}','{df_hydration_protocol}');
SELECT CASE WHEN tried_today='{df_hydration_protocol}' THEN 'PASS: repeat Yes does not duplicate' ELSE 'FAIL' END FROM symptom_checkins WHERE checkin_date='2026-10-08';
SELECT symptoms, tried_today FROM record_focus_checkin('2026-10-09','{"sleep_problems":5}','{x}');
SELECT 'PASS: new day inserts a row';
SELECT expect_fail('rating 6', $$SELECT record_focus_checkin('2026-10-08','{"hot_flashes":6}')$$);
SELECT expect_fail('rating 0', $$SELECT record_focus_checkin('2026-10-08','{"hot_flashes":0}')$$);
SELECT expect_fail('rating 2.5', $$SELECT record_focus_checkin('2026-10-08','{"hot_flashes":2.5}')$$);
SELECT expect_fail('rating as string', $$SELECT record_focus_checkin('2026-10-08','{"hot_flashes":"3"}')$$);
SELECT expect_fail('unknown key', $$SELECT record_focus_checkin('2026-10-08','{"headache":3}')$$);
SELECT expect_fail('symptoms array', $$SELECT record_focus_checkin('2026-10-08','[1]')$$);
SELECT expect_fail('done and not done', $$SELECT record_focus_checkin('2026-10-08','{}','{a}','{a}')$$);

-- user B isolation
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-0000-0000-0000-000000000002',false);
SELECT CASE WHEN count(*)=0 THEN 'PASS: B sees none of A''s programmes' ELSE 'FAIL' END FROM focus_programmes;
SELECT CASE WHEN count(*)=0 THEN 'PASS: B sees none of A''s weeks' ELSE 'FAIL' END FROM focus_weeks;
SELECT expect_fail('B attaches week to A''s programme', $$INSERT INTO focus_weeks (programme_id,user_id,sequence,recommendation_id,recommendation_snapshot,starts_on) VALUES ('11111111-0000-0000-0000-000000000001',auth.uid(),9,'x','{}','2026-10-15')$$);
SELECT record_focus_checkin('2026-10-08','{"anxiety":5}','{y}') IS NOT NULL;
SELECT 'PASS: B check-in writes B''s own row';
RESET ROLE;
SELECT CASE WHEN symptoms='{"hot_flashes":3,"anxiety":2}'::jsonb THEN 'PASS: A''s row untouched by B' ELSE 'FAIL' END FROM symptom_checkins WHERE user_id='aaaaaaaa-0000-0000-0000-000000000001' AND checkin_date='2026-10-08';

-- signed out
SET ROLE anon;
SELECT expect_fail('anon calls check-in', $$SELECT record_focus_checkin('2026-10-08','{}')$$);
RESET ROLE;
SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','',false);
SELECT expect_fail('authenticated role with no user id', $$SELECT record_focus_checkin('2026-10-08','{}')$$);
RESET ROLE;
SELECT CASE WHEN count(*)>0 THEN 'PASS: audit rows written ('||count(*)||')' ELSE 'FAIL: no audit' END FROM audit_logs WHERE table_name IN ('focus_programmes','focus_weeks');
