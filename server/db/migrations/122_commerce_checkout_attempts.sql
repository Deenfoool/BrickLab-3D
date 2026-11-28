-- A browser confirmation has a durable key independent of the provider's
-- order idempotency key. A repeat after settlement returns the original order,
-- even for repeatable goods (storage and Plus).
ALTER TABLE bricklab.commerce_orders ADD COLUMN return_to_sets boolean;
CREATE TABLE bricklab.commerce_checkout_attempts (
 user_id uuid NOT NULL REFERENCES bricklab.users(id) ON DELETE RESTRICT,
 environment text NOT NULL CHECK(environment IN ('test','live')),
 checkout_key uuid NOT NULL,
 order_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,environment,checkout_key),
 FOREIGN KEY(order_id,user_id) REFERENCES bricklab.commerce_orders(id,user_id) ON DELETE RESTRICT
);
ALTER TABLE bricklab.commerce_checkout_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY commerce_checkout_attempts_owner ON bricklab.commerce_checkout_attempts FOR SELECT TO bricklab_app
 USING(user_id::text=nullif(current_setting('bricklab.user_id',true),''));
REVOKE ALL ON bricklab.commerce_checkout_attempts FROM PUBLIC,bricklab_app;
GRANT SELECT ON bricklab.commerce_checkout_attempts TO bricklab_app;
CREATE FUNCTION bricklab.commerce_bind_checkout_attempt(p_key uuid,p_order uuid,p_environment text,p_return boolean)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 DECLARE uid uuid; existing uuid;
 BEGIN
 uid:=nullif(current_setting('bricklab.user_id',true),'')::uuid;
 IF uid IS NULL OR p_key IS NULL OR p_return IS NULL OR p_environment IS NULL OR p_environment NOT IN ('test','live') THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,312042));
 IF NOT EXISTS(SELECT 1 FROM bricklab.commerce_orders o WHERE o.id=p_order AND o.user_id=uid AND o.environment=p_environment AND o.offer_version IS NOT NULL AND o.accepted_at IS NOT NULL) THEN RETURN false; END IF;
 SELECT a.order_id INTO existing FROM bricklab.commerce_checkout_attempts a WHERE a.user_id=uid AND a.environment=p_environment AND a.checkout_key=p_key;
 IF FOUND THEN RETURN existing=p_order; END IF;
 INSERT INTO bricklab.commerce_checkout_attempts(user_id,environment,checkout_key,order_id) VALUES(uid,p_environment,p_key,p_order);
 -- Freeze the provider request payload across retry and resume surfaces.
 UPDATE bricklab.commerce_orders SET return_to_sets=p_return WHERE id=p_order AND return_to_sets IS NULL;
 RETURN true;
 END $$;
REVOKE ALL ON FUNCTION bricklab.commerce_bind_checkout_attempt(uuid,uuid,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.commerce_bind_checkout_attempt(uuid,uuid,text,boolean) TO bricklab_app;
