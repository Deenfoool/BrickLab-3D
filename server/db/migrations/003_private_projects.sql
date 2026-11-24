-- Private cloud builds. No anonymous/public/member access in this phase.
ALTER TABLE bricklab.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE bricklab.project_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_projects ON bricklab.projects FOR ALL TO bricklab_app
  USING (owner_id = nullif(current_setting('bricklab.user_id', true), '')::uuid)
  WITH CHECK (owner_id = nullif(current_setting('bricklab.user_id', true), '')::uuid AND visibility = 'private');
CREATE POLICY own_revisions_read ON bricklab.project_revisions FOR SELECT TO bricklab_app
  USING (EXISTS (SELECT 1 FROM bricklab.projects p WHERE p.id = project_id AND p.owner_id = nullif(current_setting('bricklab.user_id', true), '')::uuid));
CREATE POLICY own_revisions_insert ON bricklab.project_revisions FOR INSERT TO bricklab_app
  WITH CHECK (author_id = nullif(current_setting('bricklab.user_id', true), '')::uuid AND EXISTS
    (SELECT 1 FROM bricklab.projects p WHERE p.id = project_id AND p.owner_id = nullif(current_setting('bricklab.user_id', true), '')::uuid));
GRANT SELECT ON bricklab.projects, bricklab.project_revisions TO bricklab_app;
GRANT INSERT (owner_id, name) ON bricklab.projects TO bricklab_app;
GRANT UPDATE (name, head_revision, updated_at) ON bricklab.projects TO bricklab_app;
GRANT INSERT (project_id, revision, author_id, document) ON bricklab.project_revisions TO bricklab_app;
