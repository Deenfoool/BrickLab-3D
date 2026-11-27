-- The site session creates a short-lived hashed pairing code. Only trusted hub adapter
-- calls the Telegram identity functions after verifying a signed local bridge request.
CREATE TABLE bricklab.telegram_links (
 user_id uuid PRIMARY KEY REFERENCES bricklab.users(id) ON DELETE CASCADE,
 telegram_id bigint NOT NULL UNIQUE CHECK(telegram_id>0),
 linked_at timestamptz NOT NULL DEFAULT now(),
 marketing boolean NOT NULL DEFAULT false
);
CREATE TABLE bricklab.telegram_pairing (
 user_id uuid PRIMARY KEY REFERENCES bricklab.users(id) ON DELETE CASCADE,
 code_hash text NOT NULL UNIQUE CHECK(code_hash ~ '^[0-9a-f]{64}$'),
 expires_at timestamptz NOT NULL
);
REVOKE ALL ON bricklab.telegram_links,bricklab.telegram_pairing FROM PUBLIC,bricklab_app;
CREATE FUNCTION bricklab.telegram_pair_code(p_hash text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
DECLARE uid uuid:=nullif(current_setting('bricklab.user_id',true),'')::uuid;
BEGIN
 IF uid IS NULL OR p_hash !~ '^[0-9a-f]{64}$' OR NOT EXISTS(SELECT 1 FROM bricklab.users WHERE id=uid AND blocked_at IS NULL AND email_verified_at IS NOT NULL) THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM bricklab.telegram_links WHERE user_id=uid) THEN RETURN false; END IF;
 INSERT INTO bricklab.telegram_pairing(user_id,code_hash,expires_at) VALUES(uid,p_hash,now()+interval '10 minutes')
 ON CONFLICT(user_id) DO UPDATE SET code_hash=excluded.code_hash,expires_at=excluded.expires_at;
 RETURN true;
END $$;
CREATE FUNCTION bricklab.telegram_link_status() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 SELECT jsonb_build_object('linked',EXISTS(SELECT 1 FROM bricklab.telegram_links WHERE user_id=nullif(current_setting('bricklab.user_id',true),'')::uuid),
 'marketing',coalesce((SELECT marketing FROM bricklab.telegram_links WHERE user_id=nullif(current_setting('bricklab.user_id',true),'')::uuid),false))
$$;
CREATE FUNCTION bricklab.telegram_unlink() RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
DECLARE uid uuid:=nullif(current_setting('bricklab.user_id',true),'')::uuid;
BEGIN
 IF uid IS NULL THEN RETURN false; END IF;
 DELETE FROM bricklab.telegram_pairing WHERE user_id=uid;
 DELETE FROM bricklab.telegram_links WHERE user_id=uid;
 RETURN true;
END $$;
CREATE FUNCTION bricklab.telegram_claim(p_hash text,p_telegram bigint) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
DECLARE uid uuid;
BEGIN
 IF p_telegram IS NULL OR p_telegram<=0 OR p_hash !~ '^[0-9a-f]{64}$' THEN RETURN false; END IF;
 SELECT p.user_id INTO uid FROM bricklab.telegram_pairing p JOIN bricklab.users u ON u.id=p.user_id
 WHERE p.code_hash=p_hash AND p.expires_at>now() AND u.blocked_at IS NULL AND u.email_verified_at IS NOT NULL FOR UPDATE OF p,u;
 IF uid IS NULL THEN RETURN false; END IF;
 INSERT INTO bricklab.telegram_links(user_id,telegram_id) VALUES(uid,p_telegram) ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN RETURN false; END IF;
 DELETE FROM bricklab.telegram_pairing WHERE user_id=uid;
 RETURN true;
END $$;
CREATE FUNCTION bricklab.telegram_identity(p_telegram bigint) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 SELECT l.user_id FROM bricklab.telegram_links l JOIN bricklab.users u ON u.id=l.user_id
 WHERE l.telegram_id=p_telegram AND u.blocked_at IS NULL AND u.email_verified_at IS NOT NULL
$$;
CREATE FUNCTION bricklab.telegram_marketing(p_enabled boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
BEGIN
 UPDATE bricklab.telegram_links SET marketing=p_enabled WHERE user_id=nullif(current_setting('bricklab.user_id',true),'')::uuid;
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION bricklab.telegram_pair_code(text),bricklab.telegram_link_status(),bricklab.telegram_unlink(),bricklab.telegram_claim(text,bigint),bricklab.telegram_identity(bigint),bricklab.telegram_marketing(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.telegram_pair_code(text),bricklab.telegram_link_status(),bricklab.telegram_unlink(),bricklab.telegram_claim(text,bigint),bricklab.telegram_identity(bigint),bricklab.telegram_marketing(boolean) TO bricklab_app;
