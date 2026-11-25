-- Run only in isolated staging/test DB with migration administrator.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF current_database() NOT IN ('bricklab_browser_test','bricklab_staging') THEN RAISE EXCEPTION 'wrong database'; END IF;
END $$;
INSERT INTO bricklab.users(email,display_name,password_hash)
 VALUES ('community-owner-'||gen_random_uuid()||'@example.invalid','Owner','test-hash') RETURNING id AS test_owner \gset
INSERT INTO bricklab.users(email,display_name,password_hash)
 VALUES ('community-reader-'||gen_random_uuid()||'@example.invalid','Reader','test-hash') RETURNING id AS test_reader \gset
INSERT INTO bricklab.users(email,display_name,password_hash)
 VALUES ('community-admin-'||gen_random_uuid()||'@example.invalid','Admin','test-hash') RETURNING id AS test_admin \gset
INSERT INTO bricklab.admin_accounts(user_id) VALUES (:'test_admin');
SELECT set_config('bricklab.test_owner',:'test_owner',true),set_config('bricklab.test_reader',:'test_reader',true),set_config('bricklab.test_admin',:'test_admin',true);
SET LOCAL ROLE bricklab_app;
DO $$ DECLARE
 owner uuid:=current_setting('bricklab.test_owner')::uuid;
 reader uuid:=current_setting('bricklab.test_reader')::uuid;
 admin uuid:=current_setting('bricklab.test_admin')::uuid;
 project uuid; author uuid; commenter uuid; model uuid;
 doc jsonb:='{"format":"bricklab-3d","version":1,"name":"Model","parts":[],"connections":[]}'::jsonb;
BEGIN
 PERFORM set_config('bricklab.user_id',owner::text,true);
 INSERT INTO bricklab.projects(owner_id,name) VALUES(owner,'Model') RETURNING id INTO project;
 INSERT INTO bricklab.project_revisions(project_id,revision,author_id,document) VALUES(project,1,owner,doc);
 INSERT INTO bricklab.public_profiles(user_id,display_name) VALUES(owner,'Owner') RETURNING public_id INTO author;
 INSERT INTO bricklab.public_builds(project_id,author_id,revision,title,description,document,allow_download,allow_comments,allow_remix,images)
 VALUES(project,author,1,'Model','Description',doc,false,false,false,ARRAY[decode('AA==','base64')]) RETURNING public_id INTO model;
 BEGIN
  UPDATE bricklab.public_builds SET allow_remix=true WHERE public_id=model;
  RAISE EXCEPTION 'Remix without download accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 PERFORM set_config('bricklab.user_id',reader::text,true);
 INSERT INTO bricklab.public_profiles(user_id,display_name) VALUES(reader,'Reader') RETURNING public_id INTO commenter;
 UPDATE bricklab.public_builds SET allow_download=true WHERE public_id=model;
 IF FOUND THEN RAISE EXCEPTION 'Stranger changed publication'; END IF;
 BEGIN
  INSERT INTO bricklab.community_comments(build_id,author_id,body) VALUES(model,commenter,'Blocked');
  RAISE EXCEPTION 'Comment allowed against author setting';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 INSERT INTO bricklab.community_bookmarks(user_id,build_id) VALUES(reader,model);
 INSERT INTO bricklab.community_build_reports(reporter_id,build_id,reason) VALUES(reader,model,'copyright');
 UPDATE bricklab.community_build_reports SET resolved_at=now() WHERE build_id=model;
 IF FOUND THEN RAISE EXCEPTION 'Reader resolved own report'; END IF;
 PERFORM set_config('bricklab.user_id',owner::text,true);
 IF EXISTS(SELECT 1 FROM bricklab.community_bookmarks WHERE build_id=model) THEN RAISE EXCEPTION 'Bookmarks leak'; END IF;
 IF EXISTS(SELECT 1 FROM bricklab.community_build_reports WHERE build_id=model) THEN RAISE EXCEPTION 'Reporter leak'; END IF;
 UPDATE bricklab.public_builds SET allow_comments=true WHERE public_id=model;
 PERFORM set_config('bricklab.user_id',reader::text,true);
 INSERT INTO bricklab.community_comments(build_id,author_id,body) VALUES(model,commenter,'Allowed');
 PERFORM set_config('bricklab.user_id',admin::text,true);
 IF NOT EXISTS(SELECT 1 FROM bricklab.community_build_reports WHERE build_id=model AND resolved_at IS NULL) THEN RAISE EXCEPTION 'Admin cannot see reports'; END IF;
 UPDATE bricklab.community_build_reports SET resolved_at=now() WHERE build_id=model;
 IF NOT FOUND THEN RAISE EXCEPTION 'Admin cannot resolve report'; END IF;
 INSERT INTO bricklab.admin_audit(actor_id,action,target_id,reason) VALUES(admin,'dismiss_build_reports',model,'test');
 PERFORM set_config('bricklab.user_id',owner::text,true);
 DELETE FROM bricklab.public_builds WHERE public_id=model;
 PERFORM set_config('bricklab.user_id',reader::text,true);
 IF EXISTS(SELECT 1 FROM bricklab.community_bookmarks WHERE build_id=model) OR EXISTS(SELECT 1 FROM bricklab.community_build_reports WHERE build_id=model) THEN RAISE EXCEPTION 'Orphaned public data'; END IF;
END $$;
RESET ROLE;
DO $ BEGIN
 IF (SELECT count(*) FROM bricklab.notification_outbox WHERE kind='build')<>1 THEN RAISE EXCEPTION 'Missing or duplicate build event'; END IF;
 IF (SELECT count(*) FROM bricklab.notification_outbox WHERE kind='build_report')<>1 THEN RAISE EXCEPTION 'Missing build report event'; END IF;
 IF (SELECT count(*) FROM bricklab.notification_outbox WHERE kind='moderation')<>1 THEN RAISE EXCEPTION 'Missing moderation event'; END IF;
END $;
ROLLBACK;
\echo Community permissions and moderation DB assertions passed.
