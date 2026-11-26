-- Prepared for live release, not a release switch. All operations keep mode scoped.
ALTER TABLE bricklab.commerce_orders ADD COLUMN receipt_correction_pending boolean NOT NULL DEFAULT false;
CREATE FUNCTION bricklab.commerce_claim_live_payments() RETURNS TABLE(id uuid,payment_id text,amount_kopecks integer)
 LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 WITH due AS (SELECT o.id FROM bricklab.commerce_orders o WHERE o.environment='live' AND o.provider='yookassa' AND o.status='pending' AND o.payment_id IS NOT NULL AND o.next_payment_check_at<=now()
 ORDER BY o.next_payment_check_at,o.id LIMIT 5 FOR UPDATE SKIP LOCKED)
 UPDATE bricklab.commerce_orders o SET next_payment_check_at=now()+interval '5 minutes'
 FROM due WHERE o.id=due.id RETURNING o.id,o.payment_id,o.amount_kopecks
 $$;
CREATE OR REPLACE FUNCTION bricklab.commerce_refund_full(p_payment text,p_environment text,p_amount integer) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 DECLARE o bricklab.commerce_orders%ROWTYPE; uid uuid;
 BEGIN
 IF p_environment IS NULL OR p_environment NOT IN ('test','live') THEN RETURN false; END IF;
 SELECT user_id INTO uid FROM bricklab.commerce_orders WHERE payment_id=p_payment AND environment=p_environment AND provider='yookassa';
 IF uid IS NULL THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,312042));
 SELECT * INTO o FROM bricklab.commerce_orders WHERE payment_id=p_payment AND environment=p_environment FOR UPDATE;
 IF o.amount_kopecks<>p_amount OR o.provider<>'yookassa' THEN RETURN false; END IF;
 IF o.status='refunded' THEN RETURN true; END IF;
 IF o.status<>'succeeded' THEN RETURN false; END IF;
 UPDATE bricklab.commerce_grants SET revoked_at=greatest(now(),granted_at) WHERE order_id=o.id AND revoked_at IS NULL;
 UPDATE bricklab.commerce_orders SET status='refunded',refunded_at=now(),receipt_correction_pending=(o.environment='live') WHERE id=o.id;
 RETURN true;
 END $$;
REVOKE ALL ON FUNCTION bricklab.commerce_claim_live_payments() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.commerce_claim_live_payments() TO bricklab_app;
