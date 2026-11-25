-- Dedicated isolated database only. Verify stable identity and owner-only private data.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF current_database() NOT IN ('bricklab_browser_test','bricklab_staging') THEN RAISE EXCEPTION 'wrong database'; END IF;
END $$;
INSERT INTO bricklab.users(email,display_name,password_hash) VALUES ('unified-owner-'||gen_random_uuid()||'@example.invalid','Owner','test-hash') RETURNING id AS test_owner \gset
INSERT INTO bricklab.users(email,display_name,password_hash) VALUES ('unified-reader-'||gen_random_uuid()||'@example.invalid','Reader','test-hash') RETURNING id AS test_reader \gset
SELECT set_config('bricklab.test_owner',:'test_owner',true),set_config('bricklab.test_reader',:'test_reader',true);
SET LOCAL ROLE bricklab_app;
DO $$ DECLARE owner uuid:=current_setting('bricklab.test_owner')::uuid; reader uuid:=current_setting('bricklab.test_reader')::uuid; public1 uuid; public2 uuid;
BEGIN
 PERFORM set_config('bricklab.user_id',owner::text,true);
 INSERT INTO bricklab.profiles(user_id,bio,display_name) VALUES(owner,'private bio','Private name');
 INSERT INTO bricklab.public_profiles(user_id,display_name,bio) VALUES(owner,'Public name','public bio') RETURNING public_id INTO public1;
 IF public1 IS DISTINCT FROM (SELECT public_identity FROM bricklab.profiles WHERE user_id=owner) THEN RAISE EXCEPTION 'unstable identity'; END IF;
 IF (SELECT bio FROM bricklab.public_profiles WHERE public_id=public1)<>'public bio' THEN RAISE EXCEPTION 'private bio leaked'; END IF;
 PERFORM set_config('bricklab.user_id',reader::text,true);
 IF EXISTS(SELECT 1 FROM bricklab.profiles WHERE user_id=owner) THEN RAISE EXCEPTION 'private profile leaked'; END IF;
 UPDATE bricklab.public_profiles SET unified=true WHERE public_id=public1;
 IF FOUND THEN RAISE EXCEPTION 'stranger modified public profile'; END IF;
 PERFORM set_config('bricklab.user_id',owner::text,true);
 DELETE FROM bricklab.public_profiles WHERE public_id=public1;
 IF EXISTS(SELECT 1 FROM bricklab.public_profiles WHERE public_id=public1) THEN RAISE EXCEPTION 'unpublish failed'; END IF;
 INSERT INTO bricklab.public_profiles(user_id,display_name,bio) VALUES(owner,'Public name','public bio') RETURNING public_id INTO public2;
 IF public1 IS DISTINCT FROM public2 THEN RAISE EXCEPTION 'public link changed'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
\echo Unified profile identity and RLS assertions passed.
