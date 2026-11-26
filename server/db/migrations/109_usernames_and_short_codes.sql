-- Stable human-readable account handles. Keep all existing UUID foreign keys.
ALTER TABLE bricklab.users ADD COLUMN username text;
WITH candidates AS (
 SELECT id,lower(btrim(display_name)) AS candidate,
 row_number() OVER(PARTITION BY lower(btrim(display_name)) ORDER BY created_at,id) AS rank
 FROM bricklab.users
)
UPDATE bricklab.users u SET username=CASE
 WHEN c.rank=1 AND c.candidate ~ '^[a-z0-9][a-z0-9_.-]{2,31}$' AND c.candidate NOT LIKE 'id\_%' ESCAPE '\' THEN c.candidate
 ELSE 'id_'||replace(u.id::text,'-','') END
FROM candidates c WHERE c.id=u.id;
ALTER TABLE bricklab.users ALTER COLUMN username SET NOT NULL;
ALTER TABLE bricklab.users ADD CONSTRAINT users_username_unique UNIQUE(username),
 ADD CONSTRAINT users_username_format CHECK(username ~ '^[a-z0-9][a-z0-9_.-]{2,31}$' OR username ~ '^id_[a-f0-9]{32}$');
CREATE FUNCTION bricklab.assign_username() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,bricklab AS $$
 DECLARE candidate text;
 BEGIN
 IF NEW.username IS NOT NULL THEN RETURN NEW; END IF;
 candidate:=lower(btrim(NEW.display_name));
 PERFORM pg_advisory_xact_lock(820491109);
 IF candidate ~ '^[a-z0-9][a-z0-9_.-]{2,31}$' AND left(candidate,3)<>'id_' AND NOT EXISTS(SELECT 1 FROM bricklab.users WHERE username=candidate) THEN NEW.username:=candidate;
 ELSE NEW.username:='id_'||replace(NEW.id::text,'-',''); END IF;
 RETURN NEW;
 END $$;
CREATE TRIGGER assign_username BEFORE INSERT ON bricklab.users FOR EACH ROW EXECUTE FUNCTION bricklab.assign_username();
GRANT SELECT(username),INSERT(username) ON bricklab.users TO bricklab_app;
ALTER TABLE bricklab.account_tokens ADD COLUMN failed_attempts integer NOT NULL DEFAULT 0 CHECK(failed_attempts BETWEEN 0 AND 5);
ALTER TABLE bricklab.public_builds ADD COLUMN coauthor_ids uuid[] NOT NULL DEFAULT '{}' CHECK(cardinality(coauthor_ids)<=8);
GRANT INSERT(coauthor_ids),UPDATE(coauthor_ids) ON bricklab.public_builds TO bricklab_app;
-- Existing public-profile UUIDs remain valid. Alias only resolves a published profile.
