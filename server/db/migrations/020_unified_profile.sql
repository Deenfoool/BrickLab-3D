-- One identity with an explicit public snapshot. Existing public cards remain unchanged
-- until their owner chooses unified editing. No private biography/media is published by migration.
ALTER TABLE bricklab.profiles ADD COLUMN display_name text CHECK(length(btrim(display_name)) BETWEEN 1 AND 80);
ALTER TABLE bricklab.profiles ADD COLUMN public_identity uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE;
INSERT INTO bricklab.profiles(user_id,public_identity)
 SELECT user_id,public_id FROM bricklab.public_profiles
 ON CONFLICT(user_id) DO UPDATE SET public_identity=excluded.public_identity;
GRANT INSERT(display_name),UPDATE(display_name) ON bricklab.profiles TO bricklab_app;
ALTER TABLE bricklab.public_profiles
 ADD COLUMN unified boolean NOT NULL DEFAULT false,
 ADD COLUMN share_avatar boolean NOT NULL DEFAULT false,
 ADD COLUMN share_cover boolean NOT NULL DEFAULT false,
 ADD COLUMN portfolio jsonb CHECK(portfolio IS NULL OR (jsonb_typeof(portfolio)='object' AND octet_length(portfolio::text)<=16384)),
 ADD COLUMN show_award boolean NOT NULL DEFAULT false;
GRANT INSERT(unified,share_avatar,share_cover,portfolio,show_award),UPDATE(unified,share_avatar,share_cover,portfolio,show_award) ON bricklab.public_profiles TO bricklab_app;
-- Persist a random public ID even when the owner explicitly removes their public card.
CREATE FUNCTION bricklab.assign_public_identity() RETURNS trigger LANGUAGE plpgsql
 SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 INSERT INTO bricklab.profiles(user_id) VALUES(NEW.user_id) ON CONFLICT(user_id) DO NOTHING;
 SELECT public_identity INTO NEW.public_id FROM bricklab.profiles WHERE user_id=NEW.user_id;
 RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION bricklab.assign_public_identity() FROM PUBLIC,bricklab_app;
CREATE TRIGGER stable_public_identity BEFORE INSERT ON bricklab.public_profiles FOR EACH ROW EXECUTE FUNCTION bricklab.assign_public_identity();
