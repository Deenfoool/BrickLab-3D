-- An explicit user choice is separate from the purchased entitlement.
CREATE TABLE bricklab.commerce_badge_selection (
 user_id uuid PRIMARY KEY REFERENCES bricklab.users(id) ON DELETE CASCADE,
 badge text CHECK (badge IN ('supporter','bronze-builder','silver-builder','gold-builder','diamond-patron','founders-club'))
);
ALTER TABLE bricklab.commerce_badge_selection ENABLE ROW LEVEL SECURITY;
CREATE POLICY commerce_badge_owner ON bricklab.commerce_badge_selection TO bricklab_app
 USING (user_id::text=nullif(current_setting('bricklab.user_id',true),''))
 WITH CHECK (user_id::text=nullif(current_setting('bricklab.user_id',true),''));
REVOKE ALL ON bricklab.commerce_badge_selection FROM PUBLIC,bricklab_app;
GRANT SELECT,INSERT,UPDATE ON bricklab.commerce_badge_selection TO bricklab_app;

-- Only the chosen public badge is returned, never the ledger or account ID.
-- A refund/revocation hides it immediately; unpublished profiles return NULL.
CREATE FUNCTION bricklab.public_support_badge(profile_id uuid) RETURNS text
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,bricklab
 AS $$
 SELECT s.badge FROM bricklab.public_profiles p
 JOIN bricklab.commerce_badge_selection s ON s.user_id=p.user_id
 WHERE p.public_id=profile_id AND EXISTS (
  SELECT 1 FROM bricklab.commerce_grants g JOIN bricklab.commerce_orders o
   ON o.id=g.order_id AND o.user_id=g.user_id
  WHERE g.user_id=s.user_id AND g.kind='badge' AND g.sku=s.badge
   AND o.environment='live' AND o.status='succeeded'
   AND g.revoked_at IS NULL AND g.granted_at<=now()
   AND (g.expires_at IS NULL OR g.expires_at>now())
 )
 $$;
REVOKE ALL ON FUNCTION bricklab.public_support_badge(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.public_support_badge(uuid) TO bricklab_app;
