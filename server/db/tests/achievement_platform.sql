-- Isolated transactional integration test. Never run on production.
BEGIN;
DO $$ BEGIN
 IF current_database() NOT IN ('bricklab_commerce_check','bricklab_browser_test') THEN RAISE EXCEPTION 'test database required'; END IF;
END $$;
INSERT INTO bricklab.users(id,email,display_name,password_hash)
VALUES('00000000-0000-4000-8000-000000000101','achievement-admin@example.invalid','Achievement admin','test'),('00000000-0000-4000-8000-000000000102','achievement-user@example.invalid','Achievement user','test');
INSERT INTO bricklab.admin_accounts(user_id) VALUES('00000000-0000-4000-8000-000000000101');
SET LOCAL ROLE bricklab_app;
SELECT set_config('bricklab.user_id','00000000-0000-4000-8000-000000000102',true);
DO $$ DECLARE rule jsonb:='{"id":"custom-test-award","cat":"special","rarity":"rare","icon":"icon-trophy","metric":null,"target":1,"xp":125,"ru":"Тест","en":"Test","descRu":"Тест","descEn":"Test","hidden":true}'; BEGIN
 BEGIN
  PERFORM bricklab.admin_create_achievement(rule);
  RAISE EXCEPTION 'non-admin created award';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF bricklab.equip_achievement_style('forge') THEN RAISE EXCEPTION 'locked reward equipped'; END IF;
END $$;
SELECT set_config('bricklab.user_id','00000000-0000-4000-8000-000000000101',true);
DO $$ DECLARE rule jsonb:='{"id":"custom-test-award","cat":"special","rarity":"rare","icon":"icon-trophy","metric":null,"target":1,"xp":125,"ru":"Тест","en":"Test","descRu":"Тест","descEn":"Test","hidden":true}'; BEGIN
 IF NOT bricklab.admin_create_achievement(rule) THEN RAISE EXCEPTION 'creation failed'; END IF;
 IF bricklab.admin_create_achievement(rule) THEN RAISE EXCEPTION 'duplicate created'; END IF;
 IF NOT bricklab.admin_grant_achievement('00000000-0000-4000-8000-000000000102','custom-test-award','Integration test') THEN RAISE EXCEPTION 'grant failed'; END IF;
 IF bricklab.admin_grant_achievement('00000000-0000-4000-8000-000000000102','custom-test-award','Integration test') THEN RAISE EXCEPTION 'duplicate grant'; END IF;
END $$;
SELECT set_config('bricklab.user_id','00000000-0000-4000-8000-000000000102',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM bricklab.workshop_awards WHERE award='custom-test-award')<>1 THEN RAISE EXCEPTION 'missing award'; END IF;
 IF EXISTS(SELECT 1 FROM bricklab.achievement_rankings(0) WHERE "displayName"='Achievement user') THEN RAISE EXCEPTION 'private user in rankings'; END IF;
END $$;
DO $$ BEGIN
 IF bricklab.valid_workshop_metric_layout('["xp","xp"]'::jsonb) OR bricklab.valid_workshop_metric_layout('["email"]'::jsonb) OR bricklab.valid_workshop_metric_layout('{}'::jsonb) THEN RAISE EXCEPTION 'invalid metric layout accepted'; END IF;
 IF NOT bricklab.valid_workshop_metric_layout('[]'::jsonb) OR NOT bricklab.valid_workshop_metric_layout('["rank","likes"]'::jsonb) THEN RAISE EXCEPTION 'valid metric layout rejected'; END IF;
END $$;
ROLLBACK;
