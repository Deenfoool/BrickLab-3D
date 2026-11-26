-- Complimentary access is not a payment or a fiscal event.
CREATE TABLE bricklab.instruction_welcome_grants (
 user_id uuid NOT NULL REFERENCES bricklab.users(id) ON DELETE CASCADE,
 set_id text NOT NULL CHECK (set_id ~ '^[0-9]{3,7}-[0-9]{1,2}$'),
 slot smallint NOT NULL CHECK (slot BETWEEN 1 AND 2),
 granted_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (user_id,set_id),
 UNIQUE (user_id,slot)
);
ALTER TABLE bricklab.instruction_welcome_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY instruction_welcome_owner ON bricklab.instruction_welcome_grants FOR SELECT TO bricklab_app
 USING (user_id::text=nullif(current_setting('bricklab.user_id',true),''));
REVOKE ALL ON bricklab.instruction_welcome_grants FROM PUBLIC,bricklab_app;
GRANT SELECT ON bricklab.instruction_welcome_grants TO bricklab_app;

-- The earned second credit is distinct from the initial gift.
CREATE TABLE bricklab.instruction_first_build (
 user_id uuid PRIMARY KEY REFERENCES bricklab.users(id) ON DELETE CASCADE,
 set_id text NOT NULL CHECK(set_id ~ '^[0-9]{3,7}-[0-9]{1,2}$'),
 earned_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE bricklab.instruction_first_build ENABLE ROW LEVEL SECURITY;
CREATE POLICY instruction_first_build_owner ON bricklab.instruction_first_build FOR SELECT TO bricklab_app
 USING (user_id::text=nullif(current_setting('bricklab.user_id',true),''));
REVOKE ALL ON bricklab.instruction_first_build FROM PUBLIC,bricklab_app;
GRANT SELECT ON bricklab.instruction_first_build TO bricklab_app;
CREATE FUNCTION bricklab.earn_instruction_first_build(p_set text) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 DECLARE uid uuid;
 BEGIN
 uid:=nullif(current_setting('bricklab.user_id',true),'')::uuid;
 IF uid IS NULL OR NOT EXISTS(SELECT 1 FROM bricklab.users WHERE id=uid AND email_verified_at IS NOT NULL AND blocked_at IS NULL) THEN RAISE EXCEPTION 'verified_account_required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,312042));
 IF NOT EXISTS(SELECT 1 FROM bricklab.instruction_welcome_grants WHERE user_id=uid AND slot=1 AND set_id=p_set) THEN RETURN false; END IF;
 INSERT INTO bricklab.instruction_first_build(user_id,set_id) VALUES(uid,p_set) ON CONFLICT DO NOTHING;
 RETURN true;
 END $$;
REVOKE ALL ON FUNCTION bricklab.earn_instruction_first_build(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.earn_instruction_first_build(text) TO bricklab_app;

-- Only the trusted server calls this for audited, released large sets.
-- The same transaction lock as checkout prevents a concurrent paid and free grant.
CREATE FUNCTION bricklab.claim_instruction_welcome(p_set text) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 DECLARE uid uuid; free_slot smallint;
 BEGIN
 uid:=nullif(current_setting('bricklab.user_id',true),'')::uuid;
 IF uid IS NULL OR NOT EXISTS(SELECT 1 FROM bricklab.users u WHERE u.id=uid AND u.blocked_at IS NULL AND u.email_verified_at IS NOT NULL) THEN RAISE EXCEPTION 'verified_account_required'; END IF;
 IF p_set IS NULL OR p_set !~ '^[0-9]{3,7}-[0-9]{1,2}$' THEN RAISE EXCEPTION 'unknown_product'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,312042));
 IF EXISTS(SELECT 1 FROM bricklab.instruction_welcome_grants g WHERE g.user_id=uid AND g.set_id=p_set) THEN RETURN true; END IF;
 IF EXISTS(SELECT 1 FROM bricklab.commerce_orders o WHERE o.user_id=uid AND o.environment='live' AND o.sku='instruction-'||p_set AND o.status='pending') THEN RAISE EXCEPTION 'checkout_pending'; END IF;
 IF EXISTS(SELECT 1 FROM bricklab.commerce_grants g JOIN bricklab.commerce_orders o ON o.id=g.order_id AND o.user_id=g.user_id WHERE g.user_id=uid AND g.kind='instruction' AND g.target=p_set AND g.revoked_at IS NULL AND o.environment='live' AND o.status='succeeded') THEN RETURN true; END IF;
 SELECT s INTO free_slot FROM generate_series(1,CASE WHEN EXISTS(SELECT 1 FROM bricklab.instruction_first_build f WHERE f.user_id=uid) THEN 2 ELSE 1 END) s WHERE NOT EXISTS(SELECT 1 FROM bricklab.instruction_welcome_grants g WHERE g.user_id=uid AND g.slot=s) ORDER BY s LIMIT 1;
 IF free_slot IS NULL THEN RETURN false; END IF;
 INSERT INTO bricklab.instruction_welcome_grants(user_id,set_id,slot) VALUES(uid,p_set,free_slot);
 RETURN true;
 END $$;
REVOKE ALL ON FUNCTION bricklab.claim_instruction_welcome(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.claim_instruction_welcome(text) TO bricklab_app;

-- Public profile exposes only the badge boolean, never the private set or reward date.
CREATE FUNCTION bricklab.public_first_builder(p_public uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 SELECT EXISTS(SELECT 1 FROM bricklab.public_profiles p
 JOIN bricklab.instruction_first_build f ON f.user_id=p.user_id
 WHERE p.public_id=p_public AND p.unified
 AND p.portfolio->'blocks' @> '[{"key":"awards","visible":true}]'::jsonb)
 $$;
REVOKE ALL ON FUNCTION bricklab.public_first_builder(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.public_first_builder(uuid) TO bricklab_app;
