-- Published snapshots are separate from private projects and their history.
CREATE TABLE bricklab.public_builds (
 public_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL UNIQUE REFERENCES bricklab.projects(id) ON DELETE CASCADE,
 author_id uuid NOT NULL REFERENCES bricklab.public_profiles(public_id) ON DELETE CASCADE,
 revision integer NOT NULL CHECK(revision>0),
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 120),
 description text NOT NULL DEFAULT '' CHECK(length(description)<=1000),
 document jsonb NOT NULL CHECK(jsonb_typeof(document)='object' AND octet_length(document::text)<=4194304),
 published_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(project_id,revision) REFERENCES bricklab.project_revisions(project_id,revision) ON DELETE CASCADE
);
CREATE INDEX public_builds_recent ON bricklab.public_builds(published_at DESC,public_id);
CREATE INDEX public_builds_author ON bricklab.public_builds(author_id,published_at DESC);
ALTER TABLE bricklab.public_builds ENABLE ROW LEVEL SECURITY;
CREATE POLICY public_build_read ON bricklab.public_builds FOR SELECT TO bricklab_app USING(true);
CREATE POLICY public_build_insert ON bricklab.public_builds FOR INSERT TO bricklab_app WITH CHECK(
 EXISTS(SELECT 1 FROM bricklab.public_profiles c WHERE c.public_id=author_id AND c.user_id=nullif(current_setting('bricklab.user_id',true),'')::uuid)
 AND EXISTS(SELECT 1 FROM bricklab.projects p WHERE p.id=project_id AND p.owner_id=nullif(current_setting('bricklab.user_id',true),'')::uuid)
);
CREATE POLICY public_build_update ON bricklab.public_builds FOR UPDATE TO bricklab_app USING(
 EXISTS(SELECT 1 FROM bricklab.public_profiles c WHERE c.public_id=author_id AND c.user_id=nullif(current_setting('bricklab.user_id',true),'')::uuid)
) WITH CHECK(
 EXISTS(SELECT 1 FROM bricklab.public_profiles c WHERE c.public_id=author_id AND c.user_id=nullif(current_setting('bricklab.user_id',true),'')::uuid)
 AND EXISTS(SELECT 1 FROM bricklab.projects p WHERE p.id=project_id AND p.owner_id=nullif(current_setting('bricklab.user_id',true),'')::uuid)
);
CREATE POLICY public_build_delete ON bricklab.public_builds FOR DELETE TO bricklab_app USING(
 EXISTS(SELECT 1 FROM bricklab.public_profiles c WHERE c.public_id=author_id AND c.user_id=nullif(current_setting('bricklab.user_id',true),'')::uuid)
);
GRANT SELECT,DELETE ON bricklab.public_builds TO bricklab_app;
GRANT INSERT(project_id,author_id,revision,title,description,document),UPDATE(revision,title,description,document,published_at) ON bricklab.public_builds TO bricklab_app;
