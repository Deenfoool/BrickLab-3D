-- Public cards are explicit snapshots, separate from all private account tables.
CREATE TABLE bricklab.public_profiles (
 public_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL UNIQUE REFERENCES bricklab.users(id) ON DELETE CASCADE,
 display_name text NOT NULL CHECK(length(btrim(display_name)) BETWEEN 1 AND 80),
 bio text NOT NULL DEFAULT '' CHECK(length(bio)<=500),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX public_profiles_recent ON bricklab.public_profiles(updated_at DESC,public_id);
ALTER TABLE bricklab.public_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY public_card_read ON bricklab.public_profiles FOR SELECT TO bricklab_app USING(true);
CREATE POLICY public_card_insert ON bricklab.public_profiles FOR INSERT TO bricklab_app
 WITH CHECK(user_id=nullif(current_setting('bricklab.user_id',true),'')::uuid);
CREATE POLICY public_card_update ON bricklab.public_profiles FOR UPDATE TO bricklab_app
 USING(user_id=nullif(current_setting('bricklab.user_id',true),'')::uuid)
 WITH CHECK(user_id=nullif(current_setting('bricklab.user_id',true),'')::uuid);
CREATE POLICY public_card_delete ON bricklab.public_profiles FOR DELETE TO bricklab_app
 USING(user_id=nullif(current_setting('bricklab.user_id',true),'')::uuid);
GRANT SELECT,DELETE ON bricklab.public_profiles TO bricklab_app;
GRANT INSERT(user_id,display_name,bio),UPDATE(display_name,bio,updated_at) ON bricklab.public_profiles TO bricklab_app;
