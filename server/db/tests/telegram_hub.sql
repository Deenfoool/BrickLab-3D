BEGIN;
DO $$ BEGIN
 IF current_database() NOT IN ('bricklab_commerce_check','bricklab_browser_test') THEN RAISE EXCEPTION 'test database required'; END IF;
END $$;
INSERT INTO bricklab.users(id,email,display_name,password_hash,email_verified_at) VALUES
 ('00000000-0000-4000-8000-000000000201','hub-admin@example.invalid','Hub admin','test',now()),
 ('00000000-0000-4000-8000-000000000202','hub-user@example.invalid','Hub user','test',now()),
 ('00000000-0000-4000-8000-000000000203','hub-other@example.invalid','Hub other','test',now());
INSERT INTO bricklab.admin_accounts(user_id) VALUES('00000000-0000-4000-8000-000000000201');
SET LOCAL ROLE bricklab_app;
SELECT set_config('bricklab.user_id','00000000-0000-4000-8000-000000000202',true);
DO $$ BEGIN
 IF NOT bricklab.telegram_pair_code(repeat('a',64)) THEN RAISE EXCEPTION 'pairing creation failed'; END IF;
 IF NOT bricklab.telegram_claim(repeat('a',64),900002) THEN RAISE EXCEPTION 'pairing failed'; END IF;
 IF bricklab.telegram_claim(repeat('a',64),900003) THEN RAISE EXCEPTION 'pairing replay'; END IF;
 IF bricklab.telegram_identity(900002) IS DISTINCT FROM '00000000-0000-4000-8000-000000000202'::uuid THEN RAISE EXCEPTION 'incorrect identity'; END IF;
 IF (bricklab.telegram_link_status()->>'marketing')::boolean THEN RAISE EXCEPTION 'marketing enabled without consent'; END IF;
 IF bricklab.hub_admin_create_promo('HUBTEST',7,1,now()+interval '1 day') THEN RAISE EXCEPTION 'non-admin created promo'; END IF;
 IF bricklab.hub_campaign_create('Unauthorized',now()) IS NOT NULL THEN RAISE EXCEPTION 'non-admin campaign'; END IF;
 IF NOT bricklab.telegram_marketing(true) THEN RAISE EXCEPTION 'consent failed'; END IF;
END $$;
SELECT set_config('bricklab.user_id','00000000-0000-4000-8000-000000000201',true);
DO $$ DECLARE cid uuid; BEGIN
 IF NOT bricklab.hub_admin_create_promo('HUBTEST',7,1,now()+interval '1 day') THEN RAISE EXCEPTION 'promo creation failed'; END IF;
 cid:=bricklab.hub_campaign_create('Test announcement',now());
 IF cid IS NULL OR NOT bricklab.hub_campaign_queue(cid) THEN RAISE EXCEPTION 'campaign enqueue failed'; END IF;
 IF bricklab.hub_campaign_queue(cid) THEN RAISE EXCEPTION 'campaign queued twice'; END IF;
 IF (bricklab.hub_campaign_list()->>'eligible')::int<>1 THEN RAISE EXCEPTION 'unexpected audience'; END IF;
END $$;
SELECT set_config('bricklab.user_id','00000000-0000-4000-8000-000000000202',true);
DO $$ BEGIN
 IF NOT bricklab.hub_redeem_promo('HUBTEST') THEN RAISE EXCEPTION 'promo failed'; END IF;
 IF bricklab.hub_redeem_promo('HUBTEST') THEN RAISE EXCEPTION 'promo redeemed twice'; END IF;
 IF (SELECT count(*) FROM bricklab.hub_promo_grants)<>1 THEN RAISE EXCEPTION 'missing grant'; END IF;
 IF NOT bricklab.telegram_marketing(false) THEN RAISE EXCEPTION 'opt-out failed'; END IF;
END $$;
SELECT set_config('bricklab.user_id','00000000-0000-4000-8000-000000000203',true);
DO $$ BEGIN
 IF bricklab.hub_redeem_promo('HUBTEST') THEN RAISE EXCEPTION 'promo limit exceeded'; END IF;
 IF EXISTS(SELECT 1 FROM bricklab.hub_promo_grants) THEN RAISE EXCEPTION 'cross-account grants'; END IF;
END $$;
SELECT set_config('bricklab.user_id','00000000-0000-4000-8000-000000000201',true);
DO $$ BEGIN
 IF bricklab.hub_campaign_claim() IS NOT NULL THEN RAISE EXCEPTION 'unsubscribed recipient claimed'; END IF;
END $$;
SELECT set_config('bricklab.user_id','00000000-0000-4000-8000-000000000202',true);
DO $$ BEGIN
 IF NOT bricklab.telegram_unlink() OR bricklab.telegram_identity(900002) IS NOT NULL THEN RAISE EXCEPTION 'unlink failed'; END IF;
END $$;
ROLLBACK;
