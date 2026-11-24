-- Isolated database only. Fixtures and test payment transactions roll back.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF current_database() NOT IN ('bricklab_browser_test','bricklab_staging') THEN RAISE EXCEPTION 'wrong database'; END IF;
END $$;
INSERT INTO bricklab.users(email,display_name,password_hash) VALUES ('store-admin-'||gen_random_uuid()||'@example.invalid','Test admin','test-hash') RETURNING id AS test_admin \gset
INSERT INTO bricklab.users(email,display_name,password_hash) VALUES ('store-reader-'||gen_random_uuid()||'@example.invalid','Test reader','test-hash') RETURNING id AS test_reader \gset
INSERT INTO bricklab.admin_accounts(user_id) VALUES (:'test_admin');
SELECT set_config('bricklab.test_admin',:'test_admin',true),set_config('bricklab.test_reader',:'test_reader',true);
SET LOCAL ROLE bricklab_app;
DO $$ DECLARE
 admin uuid:=current_setting('bricklab.test_admin')::uuid;
 reader uuid:=current_setting('bricklab.test_reader')::uuid;
 first_order bricklab.store_test_orders; second_order bricklab.store_test_orders;
BEGIN
 PERFORM set_config('bricklab.user_id',reader::text,true);
 BEGIN
  PERFORM bricklab.create_test_order('carbon');
  RAISE EXCEPTION 'Non-admin created test checkout';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('bricklab.user_id',admin::text,true);
 SELECT * INTO first_order FROM bricklab.create_test_order('carbon');
 SELECT * INTO second_order FROM bricklab.create_test_order('carbon');
 IF first_order.invoice<>second_order.invoice OR first_order.amount_kopecks<>9900 THEN RAISE EXCEPTION 'Price or order deduplication error'; END IF;
 BEGIN
  UPDATE bricklab.store_test_orders SET status='paid',paid_at=now() WHERE invoice=first_order.invoice;
  RAISE EXCEPTION 'Direct update allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF bricklab.confirm_test_order(first_order.invoice,1) THEN RAISE EXCEPTION 'Underpayment accepted'; END IF;
 IF NOT bricklab.confirm_test_order(first_order.invoice,9900) THEN RAISE EXCEPTION 'Valid payment rejected'; END IF;
 IF NOT bricklab.confirm_test_order(first_order.invoice,9900) THEN RAISE EXCEPTION 'Retry rejected'; END IF;
 IF (SELECT count(*) FROM bricklab.store_test_entitlements WHERE invoice=first_order.invoice)<>1 THEN RAISE EXCEPTION 'Test entitlement missing or duplicated'; END IF;
 IF EXISTS(SELECT 1 FROM bricklab.cosmetic_entitlements WHERE item='carbon') THEN RAISE EXCEPTION 'Test payment unlocked real inventory'; END IF;
 PERFORM set_config('bricklab.user_id',reader::text,true);
 IF EXISTS(SELECT 1 FROM bricklab.store_test_orders WHERE invoice=first_order.invoice) THEN RAISE EXCEPTION 'Private order leaked'; END IF;
 IF EXISTS(SELECT 1 FROM bricklab.store_test_entitlements WHERE invoice=first_order.invoice) THEN RAISE EXCEPTION 'Private entitlement leaked'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
\echo Store payment database assertions passed.
