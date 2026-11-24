\set ON_ERROR_STOP on
BEGIN;
DO $test$
DECLARE
  owner uuid;
  viewer uuid;
  project uuid;
  doc jsonb := '{"format":"bricklab-3d","version":1,"name":"Test model","parts":[],"connections":[]}'::jsonb;
BEGIN
  INSERT INTO bricklab.users (email, display_name) VALUES ('schema-owner@example.invalid', 'Owner') RETURNING id INTO owner;
  INSERT INTO bricklab.users (email, display_name) VALUES ('schema-viewer@example.invalid', 'Viewer') RETURNING id INTO viewer;
  BEGIN
    INSERT INTO bricklab.users (email, display_name) VALUES ('SCHEMA-OWNER@example.invalid', 'Duplicate');
    RAISE EXCEPTION 'Duplicate email accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  INSERT INTO bricklab.projects (owner_id, name) VALUES (owner, 'Test model') RETURNING id INTO project;
  INSERT INTO bricklab.project_revisions (project_id, revision, author_id, document) VALUES (project, 1, owner, doc);
  SET CONSTRAINTS ALL IMMEDIATE;
  IF (SELECT visibility FROM bricklab.projects WHERE id = project) <> 'private' THEN
    RAISE EXCEPTION 'Default visibility must be private';
  END IF;
  INSERT INTO bricklab.project_members (project_id, user_id, role) VALUES (project, viewer, 'viewer');
  BEGIN
    UPDATE bricklab.project_members SET role = 'administrator' WHERE project_id = project;
    RAISE EXCEPTION 'Invalid member role accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO bricklab.project_revisions (project_id, revision, author_id, document)
      VALUES (project, 2, owner, '{"format":"bricklab-3d","version":1,"name":"Broken","parts":[]}'::jsonb);
    RAISE EXCEPTION 'Invalid document accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE bricklab.projects SET head_revision = 99 WHERE id = project;
    RAISE EXCEPTION 'Nonexistent revision accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  INSERT INTO bricklab.project_revisions (project_id, revision, author_id, document)
    VALUES (project, 2, owner, doc || '{"name":"Updated model"}'::jsonb);
  UPDATE bricklab.projects SET head_revision = 2, name = 'Updated model', updated_at = now() WHERE id = project;
  BEGIN
    UPDATE bricklab.project_revisions SET document = doc WHERE project_id = project AND revision = 1;
    RAISE EXCEPTION 'Immutable revision was changed';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;
  IF (SELECT count(*) FROM bricklab.project_revisions WHERE project_id = project) <> 2 THEN
    RAISE EXCEPTION 'Revision history lost';
  END IF;
  DELETE FROM bricklab.projects WHERE id = project;
  IF EXISTS (SELECT 1 FROM bricklab.project_revisions WHERE project_id = project)
     OR EXISTS (SELECT 1 FROM bricklab.project_members WHERE project_id = project) THEN
    RAISE EXCEPTION 'Orphaned project data';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM bricklab.schema_migrations WHERE version = '001_initial') THEN
    RAISE EXCEPTION 'Migration ledger missing';
  END IF;
END;
$test$;
ROLLBACK;
