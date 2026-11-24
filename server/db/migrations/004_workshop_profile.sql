CREATE TABLE bricklab.profiles (
 user_id uuid PRIMARY KEY REFERENCES bricklab.users(id) ON DELETE CASCADE,
 bio text NOT NULL DEFAULT '' CHECK (length(bio)<=500),
 cover text NOT NULL DEFAULT 'blueprint' CHECK (cover IN ('blueprint','graphite','amber')),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE bricklab.workshop_awards (
 user_id uuid NOT NULL REFERENCES bricklab.users(id) ON DELETE CASCADE,
 award text NOT NULL CHECK (award IN ('firstCloudSave')),
 awarded_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,award)
);
-- Existing owners are eligible for the same one-time milestone.
INSERT INTO bricklab.workshop_awards(user_id,award)
SELECT DISTINCT owner_id,'firstCloudSave' FROM bricklab.projects ON CONFLICT DO NOTHING;
ALTER TABLE bricklab.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE bricklab.workshop_awards ENABLE ROW LEVEL SECURITY;
CREATE POLICY profile_owner ON bricklab.profiles FOR ALL TO bricklab_app
 USING (user_id=nullif(current_setting('bricklab.user_id',true),'')::uuid)
 WITH CHECK (user_id=nullif(current_setting('bricklab.user_id',true),'')::uuid);
CREATE POLICY awards_owner_read ON bricklab.workshop_awards FOR SELECT TO bricklab_app
 USING (user_id=nullif(current_setting('bricklab.user_id',true),'')::uuid);
CREATE POLICY awards_owner_insert ON bricklab.workshop_awards FOR INSERT TO bricklab_app
 WITH CHECK (user_id=nullif(current_setting('bricklab.user_id',true),'')::uuid
 AND EXISTS(SELECT 1 FROM bricklab.projects WHERE owner_id=user_id));
GRANT SELECT ON bricklab.profiles,bricklab.workshop_awards TO bricklab_app;
GRANT INSERT(user_id,bio,cover),UPDATE(bio,cover,updated_at) ON bricklab.profiles TO bricklab_app;
GRANT INSERT(user_id,award) ON bricklab.workshop_awards TO bricklab_app;
