ALTER TABLE bricklab.profiles ADD COLUMN background text NOT NULL DEFAULT 'default' CHECK(background IN ('default','first-build','carbon','neon'));
GRANT INSERT(background),UPDATE(background) ON bricklab.profiles TO bricklab_app;
CREATE TABLE bricklab.profile_media (
 user_id uuid NOT NULL REFERENCES bricklab.users(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('avatar','cover')),
 image bytea NOT NULL CHECK(octet_length(image) BETWEEN 1 AND 524288),
 version uuid NOT NULL DEFAULT gen_random_uuid(),
 PRIMARY KEY(user_id,kind)
);
ALTER TABLE bricklab.profile_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_profile_media ON bricklab.profile_media FOR ALL TO bricklab_app
 USING(user_id=nullif(current_setting('bricklab.user_id',true),'')::uuid)
 WITH CHECK(user_id=nullif(current_setting('bricklab.user_id',true),'')::uuid);
GRANT SELECT,DELETE ON bricklab.profile_media TO bricklab_app;
GRANT INSERT(user_id,kind,image),UPDATE(image,version) ON bricklab.profile_media TO bricklab_app;
-- Paid entitlements are provisioned by a future verified payment service, never the browser.
CREATE TABLE bricklab.cosmetic_entitlements (
 user_id uuid NOT NULL REFERENCES bricklab.users(id) ON DELETE CASCADE,
 item text NOT NULL CHECK(item IN ('carbon','neon')),
 granted_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,item)
);
ALTER TABLE bricklab.cosmetic_entitlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_entitlements ON bricklab.cosmetic_entitlements FOR SELECT TO bricklab_app
 USING(user_id=nullif(current_setting('bricklab.user_id',true),'')::uuid);
GRANT SELECT ON bricklab.cosmetic_entitlements TO bricklab_app;
