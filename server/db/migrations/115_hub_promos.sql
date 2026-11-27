-- Promo days are entitlements, never artificial payments or receipts.
CREATE TABLE bricklab.hub_promos (
 code text PRIMARY KEY CHECK(code ~ '^[A-Z0-9][A-Z0-9_-]{3,31}$'),
 days integer NOT NULL CHECK(days BETWEEN 1 AND 90),
 max_uses integer NOT NULL CHECK(max_uses BETWEEN 1 AND 100000),
 expires_at timestamptz NOT NULL,
 created_by uuid NOT NULL REFERENCES bricklab.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 disabled boolean NOT NULL DEFAULT false
);
CREATE TABLE bricklab.hub_promo_grants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 code text NOT NULL REFERENCES bricklab.hub_promos(code),
 user_id uuid NOT NULL REFERENCES bricklab.users(id) ON DELETE CASCADE,
 granted_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL CHECK(expires_at>granted_at),
 UNIQUE(code,user_id)
);
CREATE INDEX hub_promo_owner ON bricklab.hub_promo_grants(user_id,expires_at);
REVOKE ALL ON bricklab.hub_promos,bricklab.hub_promo_grants FROM PUBLIC,bricklab_app;
ALTER TABLE bricklab.hub_promo_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY hub_promo_owner_read ON bricklab.hub_promo_grants FOR SELECT TO bricklab_app USING(user_id=nullif(current_setting('bricklab.user_id',true),'')::uuid);
GRANT SELECT ON bricklab.hub_promo_grants TO bricklab_app;
CREATE FUNCTION bricklab.hub_admin_create_promo(p_code text,p_days integer,p_limit integer,p_expiry timestamptz) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
DECLARE uid uuid:=nullif(current_setting('bricklab.user_id',true),'')::uuid;
BEGIN
 IF NOT coalesce(bricklab.is_admin(),false) THEN RETURN false; END IF;
 IF p_code IS NULL OR p_code !~ '^[A-Z0-9][A-Z0-9_-]{3,31}$' OR p_days IS NULL OR p_days NOT BETWEEN 1 AND 90 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100000 OR p_expiry IS NULL OR p_expiry<=now() OR p_expiry>now()+interval '365 days' THEN RETURN false; END IF;
 INSERT INTO bricklab.hub_promos(code,days,max_uses,expires_at,created_by) VALUES(p_code,p_days,p_limit,p_expiry,uid) ON CONFLICT DO NOTHING;
 RETURN FOUND;
END $$;
CREATE FUNCTION bricklab.hub_admin_promos() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
BEGIN
 IF NOT coalesce(bricklab.is_admin(),false) THEN RETURN NULL; END IF;
 RETURN (SELECT coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) FROM
 (SELECT c.code,c.days,c.max_uses AS "maxUses",c.expires_at AS "expiresAt",c.disabled,(SELECT count(*)::int FROM bricklab.hub_promo_grants g WHERE g.code=c.code) AS used FROM bricklab.hub_promos c ORDER BY c.created_at DESC LIMIT 100) p);
END $$;
CREATE FUNCTION bricklab.hub_admin_disable_promo(p_code text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
BEGIN
 IF NOT coalesce(bricklab.is_admin(),false) THEN RETURN false; END IF;
 UPDATE bricklab.hub_promos SET disabled=true WHERE code=p_code AND NOT disabled;
 RETURN FOUND;
END $$;
CREATE FUNCTION bricklab.hub_redeem_promo(p_code text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
DECLARE uid uuid:=nullif(current_setting('bricklab.user_id',true),'')::uuid; promo bricklab.hub_promos%ROWTYPE; starts timestamptz;
BEGIN
 IF uid IS NULL OR NOT EXISTS(SELECT 1 FROM bricklab.users WHERE id=uid AND blocked_at IS NULL AND email_verified_at IS NOT NULL) THEN RETURN false; END IF;
 -- Use the same user lock as commerce_fulfill. A promo cannot consume a paid period.
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,312042));
 SELECT * INTO promo FROM bricklab.hub_promos WHERE code=p_code FOR UPDATE;
 IF NOT FOUND OR promo.disabled OR promo.expires_at<=now() THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM bricklab.hub_promo_grants WHERE code=p_code AND user_id=uid) OR (SELECT count(*) FROM bricklab.hub_promo_grants WHERE code=p_code)>=promo.max_uses THEN RETURN false; END IF;
 SELECT greatest(now(),coalesce((SELECT max(g.expires_at) FROM bricklab.commerce_grants g JOIN bricklab.commerce_orders o ON o.id=g.order_id AND o.user_id=g.user_id WHERE g.user_id=uid AND g.kind='subscription' AND g.revoked_at IS NULL AND o.environment='live' AND o.status='succeeded'),now()),coalesce((SELECT max(expires_at) FROM bricklab.hub_promo_grants WHERE user_id=uid),now())) INTO starts;
 INSERT INTO bricklab.hub_promo_grants(code,user_id,granted_at,expires_at) VALUES(p_code,uid,starts,starts+make_interval(days=>promo.days));
 RETURN true;
END $$;
-- Paid renewals also follow previously granted promo periods. Keep the paid duration
-- as calendar months, and do not touch sandbox orders.
CREATE FUNCTION bricklab.hub_extend_paid_start() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
DECLARE ending timestamptz;
BEGIN
 IF NEW.kind='subscription' AND EXISTS(SELECT 1 FROM bricklab.commerce_orders WHERE id=NEW.order_id AND environment='live') THEN
  SELECT max(expires_at) INTO ending FROM bricklab.hub_promo_grants WHERE user_id=NEW.user_id;
  IF ending>NEW.granted_at THEN
   NEW.granted_at:=ending;
   NEW.expires_at:=ending+make_interval(months=>split_part(NEW.sku,'-',2)::integer);
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION bricklab.hub_extend_paid_start() FROM PUBLIC,bricklab_app;
CREATE TRIGGER hub_extend_paid_start BEFORE INSERT ON bricklab.commerce_grants FOR EACH ROW EXECUTE FUNCTION bricklab.hub_extend_paid_start();
REVOKE ALL ON FUNCTION bricklab.hub_admin_create_promo(text,integer,integer,timestamptz),bricklab.hub_admin_promos(),bricklab.hub_admin_disable_promo(text),bricklab.hub_redeem_promo(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.hub_admin_create_promo(text,integer,integer,timestamptz),bricklab.hub_admin_promos(),bricklab.hub_admin_disable_promo(text),bricklab.hub_redeem_promo(text) TO bricklab_app;

CREATE OR REPLACE FUNCTION bricklab.public_plus(profile_id uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 SELECT EXISTS(SELECT 1 FROM bricklab.public_profiles p JOIN bricklab.commerce_grants g ON g.user_id=p.user_id
 JOIN bricklab.commerce_orders o ON o.id=g.order_id AND o.user_id=g.user_id
 WHERE p.public_id=profile_id AND p.background_theme IS NOT NULL AND g.kind='subscription' AND g.revoked_at IS NULL
 AND g.granted_at<=now() AND g.expires_at>now() AND o.environment='live' AND o.status='succeeded') OR EXISTS(SELECT 1 FROM bricklab.public_profiles p JOIN bricklab.hub_promo_grants g ON g.user_id=p.user_id WHERE p.public_id=profile_id AND p.background_theme IS NOT NULL AND g.granted_at<=now() AND g.expires_at>now())
 $$;
REVOKE ALL ON FUNCTION bricklab.public_plus(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.public_plus(uuid) TO bricklab_app;

CREATE OR REPLACE FUNCTION bricklab.public_active_theme(profile_id uuid) RETURNS text
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 SELECT CASE
 WHEN p.background_theme IS NULL THEN NULL
 WHEN p.background_theme IN ('default','first-build') THEN p.background_theme
 WHEN EXISTS(SELECT 1 FROM bricklab.admin_accounts a WHERE a.user_id=p.user_id)
 OR EXISTS(SELECT 1 FROM bricklab.cosmetic_entitlements e WHERE e.user_id=p.user_id AND e.item=p.background_theme)
 OR EXISTS(
  SELECT 1 FROM bricklab.commerce_grants g JOIN bricklab.commerce_orders o ON o.id=g.order_id AND o.user_id=g.user_id
  WHERE g.user_id=p.user_id AND o.environment='live' AND o.status='succeeded'
  AND g.revoked_at IS NULL AND g.granted_at<=now() AND (g.expires_at IS NULL OR g.expires_at>now())
  AND (g.kind='themeBundle' OR (g.kind='theme' AND g.target=p.background_theme)
   OR (g.kind='subscription' AND EXISTS(SELECT 1 FROM bricklab.commerce_plus_theme t WHERE t.user_id=p.user_id AND t.theme=p.background_theme)))
 ) OR EXISTS(SELECT 1 FROM bricklab.hub_promo_grants g JOIN bricklab.commerce_plus_theme t ON t.user_id=g.user_id WHERE g.user_id=p.user_id AND g.granted_at<=now() AND g.expires_at>now() AND t.theme=p.background_theme) THEN p.background_theme ELSE 'default' END
 FROM bricklab.public_profiles p WHERE p.public_id=profile_id
 $$;
REVOKE ALL ON FUNCTION bricklab.public_active_theme(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.public_active_theme(uuid) TO bricklab_app;
