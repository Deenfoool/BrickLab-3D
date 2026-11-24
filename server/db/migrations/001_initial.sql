-- BrickLab cloud storage. No public application access is granted here.
CREATE TABLE bricklab.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL CHECK (email = btrim(email) AND length(email) BETWEEN 3 AND 254),
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_unique ON bricklab.users (lower(email));

CREATE TABLE bricklab.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES bricklab.users(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 4000),
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'unlisted', 'public')),
  head_revision integer NOT NULL DEFAULT 1 CHECK (head_revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX projects_owner_updated ON bricklab.projects (owner_id, updated_at DESC, id);
CREATE INDEX projects_public_updated ON bricklab.projects (updated_at DESC, id)
  WHERE visibility = 'public';

CREATE TABLE bricklab.project_revisions (
  project_id uuid NOT NULL REFERENCES bricklab.projects(id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK (revision > 0),
  author_id uuid NOT NULL REFERENCES bricklab.users(id) ON DELETE RESTRICT,
  document jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, revision),
  CONSTRAINT valid_bricklab_document CHECK ((
    jsonb_typeof(document) = 'object'
    AND document->>'format' = 'bricklab-3d'
    AND document->'version' = '1'::jsonb
    AND jsonb_typeof(document->'name') = 'string'
    AND length(btrim(document->>'name')) BETWEEN 1 AND 120
    AND length(document->>'name') <= 120
    AND jsonb_typeof(document->'parts') = 'array'
    AND jsonb_typeof(document->'connections') = 'array'
  ) IS TRUE)
);

-- Creating a project and its first revision is one transaction.
-- The head can never reference a nonexistent revision or another project.
ALTER TABLE bricklab.projects ADD CONSTRAINT projects_head_revision_fk
  FOREIGN KEY (id, head_revision) REFERENCES bricklab.project_revisions(project_id, revision)
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE bricklab.project_members (
  project_id uuid NOT NULL REFERENCES bricklab.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES bricklab.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('editor', 'viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);
CREATE INDEX project_members_user ON bricklab.project_members (user_id, project_id);

-- Snapshots are append-only. Project deletion may still cascade.
CREATE FUNCTION bricklab.reject_revision_update() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Project revisions are immutable' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER immutable_revision BEFORE UPDATE ON bricklab.project_revisions
  FOR EACH ROW EXECUTE FUNCTION bricklab.reject_revision_update();

REVOKE ALL ON SCHEMA bricklab FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA bricklab FROM PUBLIC;
