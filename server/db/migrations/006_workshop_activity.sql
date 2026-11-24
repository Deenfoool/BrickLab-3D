CREATE TABLE bricklab.project_favorites (
 user_id uuid NOT NULL REFERENCES bricklab.users(id) ON DELETE CASCADE,
 project_id uuid NOT NULL REFERENCES bricklab.projects(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,project_id)
);
CREATE TABLE bricklab.award_reads (
 user_id uuid NOT NULL,
 award text NOT NULL,
 read_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,award),
 FOREIGN KEY(user_id,award) REFERENCES bricklab.workshop_awards(user_id,award) ON DELETE CASCADE
);
ALTER TABLE bricklab.project_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE bricklab.award_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_favorites ON bricklab.project_favorites FOR ALL TO bricklab_app
 USING(user_id=nullif(current_setting('bricklab.user_id',true),'')::uuid)
 WITH CHECK(user_id=nullif(current_setting('bricklab.user_id',true),'')::uuid AND EXISTS(SELECT 1 FROM bricklab.projects p WHERE p.id=project_id AND p.owner_id=user_id));
CREATE POLICY own_award_reads ON bricklab.award_reads FOR ALL TO bricklab_app
 USING(user_id=nullif(current_setting('bricklab.user_id',true),'')::uuid)
 WITH CHECK(user_id=nullif(current_setting('bricklab.user_id',true),'')::uuid);
GRANT SELECT,DELETE ON bricklab.project_favorites TO bricklab_app;
GRANT INSERT(user_id,project_id) ON bricklab.project_favorites TO bricklab_app;
GRANT SELECT ON bricklab.award_reads TO bricklab_app;
GRANT INSERT(user_id,award) ON bricklab.award_reads TO bricklab_app;
