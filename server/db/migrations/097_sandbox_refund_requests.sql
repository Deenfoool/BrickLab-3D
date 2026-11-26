-- Persist refund requests before contacting the provider; reuse the order UUID
-- as the refund idempotence key (distinct from payment creation's random key).
ALTER TABLE bricklab.commerce_orders ADD COLUMN refund_requested_at timestamptz,
 ADD COLUMN provider_refund_id text CHECK(provider_refund_id IS NULL OR length(provider_refund_id) BETWEEN 1 AND 128);
CREATE UNIQUE INDEX commerce_provider_refund_unique ON bricklab.commerce_orders(environment,provider_refund_id) WHERE provider_refund_id IS NOT NULL;
CREATE FUNCTION bricklab.commerce_request_test_refund(p_order uuid)
 RETURNS TABLE(id uuid,payment_id text,amount_kopecks integer,refund_requested_at timestamptz,provider_refund_id text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 DECLARE uid uuid;
 BEGIN
 uid:=nullif(current_setting('bricklab.user_id',true),'')::uuid;
 IF uid IS NULL OR NOT EXISTS(SELECT 1 FROM bricklab.admin_accounts a WHERE a.user_id=uid) THEN RAISE EXCEPTION 'admin_required'; END IF;
 RETURN QUERY UPDATE bricklab.commerce_orders o SET refund_requested_at=coalesce(o.refund_requested_at,now())
 WHERE o.id=p_order AND o.user_id=uid AND o.environment='test' AND o.status='succeeded' AND o.payment_id IS NOT NULL
 RETURNING o.id,o.payment_id,o.amount_kopecks,o.refund_requested_at,o.provider_refund_id;
 END $$;
CREATE FUNCTION bricklab.commerce_attach_test_refund(p_order uuid,p_refund text) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 BEGIN
 UPDATE bricklab.commerce_orders o SET provider_refund_id=p_refund
 WHERE o.id=p_order AND o.environment='test' AND o.refund_requested_at IS NOT NULL AND o.status IN ('succeeded','refunded')
 AND (o.provider_refund_id IS NULL OR o.provider_refund_id=p_refund);
 RETURN FOUND;
 END $$;
CREATE FUNCTION bricklab.commerce_claim_test_refunds()
 RETURNS TABLE(id uuid,payment_id text,amount_kopecks integer,provider_refund_id text)
 LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 WITH due AS (SELECT o.id FROM bricklab.commerce_orders o WHERE o.environment='test' AND o.status='succeeded'
 AND o.provider_refund_id IS NOT NULL AND o.next_payment_check_at<=now() ORDER BY o.next_payment_check_at,o.id LIMIT 5 FOR UPDATE SKIP LOCKED)
 UPDATE bricklab.commerce_orders o SET next_payment_check_at=now()+interval '5 minutes'
 FROM due WHERE o.id=due.id RETURNING o.id,o.payment_id,o.amount_kopecks,o.provider_refund_id
 $$;
REVOKE ALL ON FUNCTION bricklab.commerce_request_test_refund(uuid),bricklab.commerce_attach_test_refund(uuid,text),bricklab.commerce_claim_test_refunds() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.commerce_request_test_refund(uuid),bricklab.commerce_attach_test_refund(uuid,text),bricklab.commerce_claim_test_refunds() TO bricklab_app;
