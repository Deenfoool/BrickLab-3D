\set ON_ERROR_STOP on
BEGIN;
INSERT INTO bricklab.users(email,display_name)
VALUES (gen_random_uuid()::text||'@example.invalid','Access test owner')
RETURNING id AS owner_id \gset
INSERT INTO bricklab.users(email,display_name)
VALUES (gen_random_uuid()::text||'@example.invalid','Access test stranger')
RETURNING id AS stranger_id \gset
SELECT set_config('bricklab.test_owner', :'owner_id', true),
       set_config('bricklab.test_stranger', :'stranger_id', true);
SET LOCAL ROLE bricklab_app;
DO $test$
DECLARE
  owner uuid := current_setting('bricklab.test_owner')::uuid;
  stranger uuid := current_setting('bricklab.test_stranger')::uuid;
  project uuid;
  doc jsonb := '{"format":"bricklab-3d","version":1,"name":"Access test","parts":[],"connections":[]}'::jsonb;
BEGIN
  PERFORM set_config('bricklab.user_id',owner::text,true);
  INSERT INTO bricklab.projects(owner_id,name) VALUES(owner,'Access test') RETURNING id INTO project;
  INSERT INTO bricklab.project_revisions(project_id,revision,author_id,document) VALUES(project,1,owner,doc);
  IF NOT EXISTS(SELECT 1 FROM bricklab.projects WHERE id=project) OR
     NOT EXISTS(SELECT 1 FROM bricklab.project_revisions WHERE project_id=project) THEN
     RAISE EXCEPTION 'Owner cannot read own project';
  END IF;
  INSERT INTO bricklab.project_revisions(project_id,revision,author_id,document) VALUES(project,2,owner,doc);
  UPDATE bricklab.projects SET head_revision=2 WHERE id=project;
  SET CONSTRAINTS ALL IMMEDIATE;
  PERFORM set_config('bricklab.user_id',stranger::text,true);
  IF EXISTS(SELECT 1 FROM bricklab.projects WHERE id=project) OR
     EXISTS(SELECT 1 FROM bricklab.project_revisions WHERE project_id=project) THEN
     RAISE EXCEPTION 'Unauthorized project read';
  END IF;
  UPDATE bricklab.projects SET name='Unauthorized change' WHERE id=project;
  IF FOUND THEN RAISE EXCEPTION 'Unauthorized project update'; END IF;
  BEGIN
    INSERT INTO bricklab.project_revisions(project_id,revision,author_id,document) VALUES(project,3,stranger,doc);
    RAISE EXCEPTION 'Unauthorized revision insert';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM set_config('bricklab.user_id','',true);
  IF EXISTS(SELECT 1 FROM bricklab.projects WHERE id=project) THEN
    RAISE EXCEPTION 'Missing identity allowed project read';
  END IF;
  PERFORM set_config('bricklab.user_id',owner::text,true);
  IF (SELECT head_revision FROM bricklab.projects WHERE id=project) <> 2 THEN
    RAISE EXCEPTION 'Revision head incorrect';
  END IF;
END;
$test$;
RESET ROLE;
ROLLBACK;
SELECT 'Project isolation test passed' AS result;
