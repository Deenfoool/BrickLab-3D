CREATE TABLE bricklab.commerce_plus_theme (
 user_id uuid PRIMARY KEY REFERENCES bricklab.users(id) ON DELETE CASCADE,
 theme text NOT NULL CHECK(theme IN ('carbon','neon','blueprint','titanium','ember','aurora')),
 changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE bricklab.commerce_plus_theme ENABLE ROW LEVEL SECURITY;
CREATE POLICY commerce_plus_theme_owner ON bricklab.commerce_plus_theme TO bricklab_app
 USING(user_id::text=nullif(current_setting('bricklab.user_id',true),''))
 WITH CHECK(user_id::text=nullif(current_setting('bricklab.user_id',true),''));
REVOKE ALL ON bricklab.commerce_plus_theme FROM PUBLIC,bricklab_app;
GRANT SELECT,INSERT,UPDATE ON bricklab.commerce_plus_theme TO bricklab_app;

-- Published appearance cannot outlive the corresponding entitlement.
CREATE FUNCTION bricklab.public_active_theme(profile_id uuid) RETURNS text
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
 ) THEN p.background_theme ELSE 'default' END
 FROM bricklab.public_profiles p WHERE p.public_id=profile_id
 $$;
REVOKE ALL ON FUNCTION bricklab.public_active_theme(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.public_active_theme(uuid) TO bricklab_app;
