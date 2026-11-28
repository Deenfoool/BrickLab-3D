-- Run only in a disposable migrated database, as migration administrator.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO bricklab.users(id,email,display_name,password_hash) VALUES
 ('10000000-0000-4000-8000-000000000001','commerce-a@example.invalid','Commerce A','scrypt$'||repeat('0',32)||'$'||repeat('0',128)),
 ('10000000-0000-4000-8000-000000000002','commerce-b@example.invalid','Commerce B','scrypt$'||repeat('0',32)||'$'||repeat('0',128));
INSERT INTO bricklab.commerce_orders(id,user_id,sku,title,amount_kopecks,provider,environment,status,payment_id,paid_at) VALUES
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','slots-20','Slots',9900,'yookassa','live','succeeded','test-fixture-a',now()),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','slots-30','Slots',12900,'yookassa','live','succeeded','test-fixture-b',now());
INSERT INTO bricklab.commerce_grants(order_id,user_id,kind,sku) VALUES
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','storage','slots-20'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','storage','slots-30');
DO $$
BEGIN
 BEGIN
  INSERT INTO bricklab.commerce_grants(order_id,user_id,kind,sku)
  VALUES ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','storage','slots-100');
  RAISE EXCEPTION 'cross-owner grant accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL;
 END;
 BEGIN
  INSERT INTO bricklab.commerce_grants(order_id,user_id,kind,sku)
  VALUES ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','storage','slots-20');
  RAISE EXCEPTION 'duplicate grant accepted';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
END $$;
INSERT INTO bricklab.admin_accounts(user_id) VALUES ('10000000-0000-4000-8000-000000000002');
SET LOCAL ROLE bricklab_app;
DO $audit$
DECLARE day date:=(now() AT TIME ZONE 'Europe/Moscow')::date;
BEGIN
 PERFORM set_config('bricklab.user_id','10000000-0000-4000-8000-000000000001',true);
 BEGIN
  PERFORM bricklab.commerce_admin_export('live',day,day);
  RAISE EXCEPTION 'nonadmin export accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'admin_required' THEN RAISE; END IF;
 END;
 PERFORM set_config('bricklab.user_id','10000000-0000-4000-8000-000000000002',true);
 IF (SELECT count(*) FROM bricklab.commerce_admin_export('live',day,day))<>2 THEN RAISE EXCEPTION 'export incomplete'; END IF;
 IF has_table_privilege(current_user,'bricklab.commerce_admin_audit','SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'audit table exposed'; END IF;
 PERFORM bricklab.commerce_admin_audit_write('30000000-0000-4000-8000-000000000001','finance_export','live',NULL,'started');
 PERFORM bricklab.commerce_admin_audit_write('30000000-0000-4000-8000-000000000001','finance_export','live',NULL,'succeeded');
 IF (SELECT count(*) FROM bricklab.commerce_admin_audit_list('live'))<>2 THEN RAISE EXCEPTION 'audit incomplete'; END IF;
 PERFORM set_config('bricklab.user_id','',true);
END $audit$;
DO $$
BEGIN
 IF (SELECT count(*) FROM bricklab.commerce_orders)<>0 THEN RAISE EXCEPTION 'unscoped orders exposed'; END IF;
 IF (SELECT count(*) FROM bricklab.commerce_grants)<>0 THEN RAISE EXCEPTION 'unscoped grants exposed'; END IF;
 PERFORM set_config('bricklab.user_id','10000000-0000-4000-8000-000000000001',true);
 IF (SELECT count(*) FROM bricklab.commerce_orders)<>1 THEN RAISE EXCEPTION 'order isolation failed'; END IF;
 IF (SELECT count(*) FROM bricklab.commerce_grants WHERE sku='slots-20')<>1 OR
    (SELECT count(*) FROM bricklab.commerce_grants)<>1 THEN RAISE EXCEPTION 'grant isolation failed'; END IF;
 IF has_table_privilege(current_user,'bricklab.commerce_orders','INSERT,UPDATE,DELETE') OR
    has_table_privilege(current_user,'bricklab.commerce_grants','INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'app role has write access';
 END IF;
END $$;
ROLLBACK;
\echo Commerce SQL isolation checks passed
