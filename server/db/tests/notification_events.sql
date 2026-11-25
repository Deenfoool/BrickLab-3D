-- Run only in a disposable database. Nothing is delivered by these tests.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF current_database() NOT IN ('bricklab_browser_test','bricklab_staging') THEN RAISE EXCEPTION 'wrong database'; END IF;
END $$;
INSERT INTO bricklab.users(email,display_name,password_hash) VALUES ('event-test-'||gen_random_uuid()||'@example.invalid','Event tester','test-hash') RETURNING id AS test_user \gset
INSERT INTO bricklab.users(email,display_name,password_hash) VALUES ('event-admin-'||gen_random_uuid()||'@example.invalid','Event admin','test-hash') RETURNING id AS test_admin \gset
INSERT INTO bricklab.admin_accounts(user_id) VALUES (:'test_admin');
SELECT set_config('bricklab.event_user',:'test_user',true),set_config('bricklab.event_admin',:'test_admin',true),set_config('bricklab.event_bug',gen_random_uuid()::text,true);
SET LOCAL ROLE bricklab_app;
DO $$ DECLARE uid uuid:=current_setting('bricklab.event_user')::uuid; rid uuid:=current_setting('bricklab.event_bug')::uuid;
BEGIN
 PERFORM set_config('bricklab.user_id',uid::text,true);
 IF NOT bricklab.submit_operator_bug(rid,'Editor','Test summary') THEN RAISE EXCEPTION 'bug not accepted'; END IF;
 IF NOT bricklab.submit_operator_bug(rid,'Editor','Test summary') THEN RAISE EXCEPTION 'retry failed'; END IF;
 IF NOT bricklab.submit_operator_bug(gen_random_uuid(),'Editor','second') OR NOT bricklab.submit_operator_bug(gen_random_uuid(),'Editor','third') THEN RAISE EXCEPTION 'valid report rejected'; END IF;
 IF bricklab.submit_operator_bug(gen_random_uuid(),'Editor','fourth') THEN RAISE EXCEPTION 'rate limit failed'; END IF;
 IF EXISTS(SELECT 1 FROM bricklab.operator_bug_reports WHERE id=rid) THEN RAISE EXCEPTION 'nonadmin read report'; END IF;
 BEGIN
  PERFORM 1 FROM bricklab.notification_outbox;
  RAISE EXCEPTION 'outbox accessible by app';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM bricklab.enqueue_admin_event('fake','registration','{}');
  RAISE EXCEPTION 'forged event accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('bricklab.user_id',current_setting('bricklab.event_admin'),true);
 IF NOT EXISTS(SELECT 1 FROM bricklab.operator_bug_reports WHERE id=rid) THEN RAISE EXCEPTION 'admin cannot see report'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF (SELECT count(*) FROM bricklab.notification_outbox WHERE event_key='registration:'||current_setting('bricklab.event_user'))<>1 THEN RAISE EXCEPTION 'registration event missing'; END IF;
 IF (SELECT count(*) FROM bricklab.notification_outbox WHERE event_key='bug:'||current_setting('bricklab.event_bug'))<>1 THEN RAISE EXCEPTION 'bug duplicate or missing'; END IF;
 IF EXISTS(SELECT 1 FROM bricklab.notification_outbox WHERE kind='registration' AND (payload ? 'email' OR payload ? 'password_hash')) THEN RAISE EXCEPTION 'private account data leaked'; END IF;
 PERFORM bricklab.prepare_notification_digest();
 PERFORM bricklab.prepare_notification_digest();
 IF (SELECT count(*) FROM bricklab.notification_outbox WHERE kind='daily')>1 THEN RAISE EXCEPTION 'duplicate digest'; END IF;
END $$;
ROLLBACK;
\echo Notification outbox, role, deduplication and rate limit assertions passed.
