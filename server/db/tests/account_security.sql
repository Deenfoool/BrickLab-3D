-- Run with the migration administrator against the isolated browser-test database.
-- Every fixture and every change is rolled back.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF current_database()<>'bricklab_browser_test' THEN RAISE EXCEPTION 'wrong database'; END IF;
END $$;
INSERT INTO bricklab.users(email,display_name,password_hash)
 VALUES ('security-test-admin-'||gen_random_uuid()||'@example.invalid','Test admin','test-hash')
 RETURNING id AS test_admin \gset
INSERT INTO bricklab.users(email,display_name,password_hash)
 VALUES ('security-test-user-'||gen_random_uuid()||'@example.invalid','Test user','test-hash')
 RETURNING id AS test_user \gset
INSERT INTO bricklab.admin_accounts(user_id) VALUES (:'test_admin');
INSERT INTO bricklab.sessions(token_hash,user_id,expires_at)
 VALUES (repeat('a',32)||replace(gen_random_uuid()::text,'-',''),:'test_user',now()+interval '1 hour');
SELECT set_config('bricklab.test_admin',:'test_admin',true);
SELECT set_config('bricklab.test_user',:'test_user',true);
SET LOCAL ROLE bricklab_app;
SELECT set_config('bricklab.user_id',current_setting('bricklab.test_user'),true);
DO $$ BEGIN
 IF bricklab.is_admin() THEN RAISE EXCEPTION 'ordinary user got admin role'; END IF;
 IF has_table_privilege(current_user,'bricklab.admin_accounts','INSERT') OR has_table_privilege(current_user,'bricklab.admin_accounts','UPDATE') OR has_table_privilege(current_user,'bricklab.admin_accounts','DELETE') THEN RAISE EXCEPTION 'app can modify administrator grants'; END IF;
 IF has_column_privilege(current_user,'bricklab.users','blocked_at','UPDATE') THEN RAISE EXCEPTION 'app can bypass blocking function'; END IF;
 BEGIN
  PERFORM bricklab.admin_account_action(current_setting('bricklab.test_admin')::uuid,'block');
  RAISE EXCEPTION 'ordinary user could block account';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 IF EXISTS(SELECT 1 FROM bricklab.admin_audit) THEN RAISE EXCEPTION 'ordinary user can read audit'; END IF;
END $$;
SELECT set_config('bricklab.user_id',current_setting('bricklab.test_admin'),true);
DO $$ DECLARE target uuid:=current_setting('bricklab.test_user')::uuid; BEGIN
 IF NOT bricklab.is_admin() THEN RAISE EXCEPTION 'administrator role missing'; END IF;
 IF NOT bricklab.admin_account_action(target,'block') THEN RAISE EXCEPTION 'block failed'; END IF;
 IF NOT EXISTS(SELECT id FROM bricklab.users WHERE id=target AND blocked_at IS NOT NULL) THEN RAISE EXCEPTION 'blocked timestamp missing'; END IF;
 IF EXISTS(SELECT 1 FROM bricklab.sessions WHERE user_id=target) THEN RAISE EXCEPTION 'session was not revoked'; END IF;
 IF bricklab.admin_account_action(current_setting('bricklab.test_admin')::uuid,'block') THEN RAISE EXCEPTION 'administrator could block administrator'; END IF;
 IF NOT bricklab.admin_account_action(target,'unblock') THEN RAISE EXCEPTION 'unblock failed'; END IF;
 IF EXISTS(SELECT id FROM bricklab.users WHERE id=target AND blocked_at IS NOT NULL) THEN RAISE EXCEPTION 'unblock timestamp not cleared'; END IF;
 INSERT INTO bricklab.admin_audit(actor_id,action,target_id,reason)
 VALUES(current_setting('bricklab.test_admin')::uuid,'unblock',target,'transactional security test');
 IF NOT EXISTS(SELECT 1 FROM bricklab.admin_audit WHERE target_id=target) THEN RAISE EXCEPTION 'audit write failed'; END IF;
END $$;
SELECT set_config('bricklab.user_id',current_setting('bricklab.test_user'),true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM bricklab.admin_audit WHERE target_id=current_setting('bricklab.test_user')::uuid) THEN RAISE EXCEPTION 'audit RLS leaked'; END IF;
END $$;
ROLLBACK;
\echo Account security DB assertions passed; all fixtures rolled back.
