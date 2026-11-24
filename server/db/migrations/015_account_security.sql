
ALTER TABLE bricklab.users ADD COLUMN email_verified_at timestamptz, ADD COLUMN blocked_at timestamptz;
GRANT SELECT(created_at,email_verified_at,blocked_at), UPDATE(password_hash,email_verified_at) ON bricklab.users TO bricklab_app;
CREATE TABLE bricklab.account_tokens (
 email text NOT NULL CHECK(length(email) BETWEEN 3 AND 254 AND email=lower(email)),
 purpose text NOT NULL CHECK(purpose IN ('register','reset')),
 token_hash text NOT NULL CHECK(token_hash ~ '^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,
 PRIMARY KEY(email,purpose)
);
CREATE INDEX account_tokens_expiry ON bricklab.account_tokens(expires_at);
GRANT SELECT,INSERT,UPDATE,DELETE ON bricklab.account_tokens TO bricklab_app;
CREATE TABLE bricklab.admin_accounts (
 user_id uuid PRIMARY KEY REFERENCES bricklab.users(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON bricklab.admin_accounts TO bricklab_app;
CREATE FUNCTION bricklab.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM bricklab.admin_accounts a JOIN bricklab.users u ON u.id=a.user_id WHERE a.user_id=nullif(current_setting('bricklab.user_id',true),'')::uuid AND u.blocked_at IS NULL)
$$;
REVOKE ALL ON FUNCTION bricklab.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.is_admin() TO bricklab_app;
CREATE TABLE bricklab.admin_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,actor_id uuid REFERENCES bricklab.users(id) ON DELETE SET NULL,
 action text NOT NULL CHECK(action IN ('block','unblock','revoke_sessions','hide_comment','dismiss_reports','unpublish_build','unpublish_profile')),
 target_id uuid NOT NULL, reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 500),created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE bricklab.admin_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_read ON bricklab.admin_audit FOR SELECT TO bricklab_app USING(bricklab.is_admin());
CREATE POLICY audit_write ON bricklab.admin_audit FOR INSERT TO bricklab_app WITH CHECK(bricklab.is_admin() AND actor_id=nullif(current_setting('bricklab.user_id',true),'')::uuid);
GRANT SELECT,INSERT(actor_id,action,target_id,reason) ON bricklab.admin_audit TO bricklab_app;
CREATE FUNCTION bricklab.admin_account_action(target uuid,operation text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT bricklab.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF operation NOT IN ('block','unblock','revoke_sessions') OR EXISTS(SELECT 1 FROM bricklab.admin_accounts WHERE user_id=target) THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(target::text,312042));
 IF NOT EXISTS(SELECT 1 FROM bricklab.users WHERE id=target) THEN RETURN false; END IF;
 IF operation='block' THEN UPDATE bricklab.users SET blocked_at=coalesce(blocked_at,now()) WHERE id=target;
 ELSIF operation='unblock' THEN UPDATE bricklab.users SET blocked_at=NULL WHERE id=target; END IF;
 IF operation IN ('block','revoke_sessions') THEN DELETE FROM bricklab.sessions WHERE user_id=target; END IF;
 IF operation='block' THEN DELETE FROM bricklab.account_tokens WHERE email=(SELECT email FROM bricklab.users WHERE id=target); END IF;
 RETURN true;
END
$$;
REVOKE ALL ON FUNCTION bricklab.admin_account_action(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.admin_account_action(uuid,text) TO bricklab_app;
ALTER TABLE bricklab.community_comment_reports ADD COLUMN resolved_at timestamptz;
CREATE POLICY admin_reports_read ON bricklab.community_comment_reports FOR SELECT TO bricklab_app USING(bricklab.is_admin());
CREATE POLICY admin_reports_update ON bricklab.community_comment_reports FOR UPDATE TO bricklab_app USING(bricklab.is_admin()) WITH CHECK(bricklab.is_admin());
GRANT UPDATE(resolved_at) ON bricklab.community_comment_reports TO bricklab_app;
CREATE POLICY admin_comment_hide ON bricklab.community_comments FOR UPDATE TO bricklab_app USING(bricklab.is_admin()) WITH CHECK(bricklab.is_admin() AND body IS NULL);
CREATE POLICY admin_build_remove ON bricklab.public_builds FOR DELETE TO bricklab_app USING(bricklab.is_admin());
CREATE POLICY admin_profile_remove ON bricklab.public_profiles FOR DELETE TO bricklab_app USING(bricklab.is_admin());
