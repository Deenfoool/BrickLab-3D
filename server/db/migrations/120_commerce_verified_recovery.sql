-- Recover provider-confirmed orders even if the original checkout response
-- was lost before the provider payment ID was persisted. Do not bind a payment
-- based on browser input. Only the server's verified provider adapter calls
-- these functions. Preserve the existing strict fulfillment API.
CREATE FUNCTION bricklab.commerce_settle_verified(p_order uuid,p_payment text,p_environment text,p_amount integer,p_refunded boolean DEFAULT false)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 DECLARE o bricklab.commerce_orders%ROWTYPE; uid uuid;
 BEGIN
 IF p_environment IS NULL OR p_environment NOT IN ('test','live') OR p_amount IS NULL OR p_refunded IS NULL
 OR p_payment IS NULL OR p_payment !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN false; END IF;
 SELECT user_id INTO uid FROM bricklab.commerce_orders WHERE id=p_order;
 IF uid IS NULL THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,312042));
 SELECT * INTO o FROM bricklab.commerce_orders WHERE id=p_order FOR UPDATE;
 IF NOT FOUND OR o.provider<>'yookassa' OR o.environment<>p_environment OR o.amount_kopecks<>p_amount
 OR (o.payment_id IS NOT NULL AND o.payment_id<>p_payment)
 OR (o.environment='live' AND (o.offer_version IS NULL OR o.accepted_at IS NULL)) THEN RETURN false; END IF;
 IF o.status='refunded' THEN RETURN o.payment_id=p_payment; END IF;
 IF o.status NOT IN ('pending','succeeded') THEN RETURN false; END IF;
 IF o.payment_id IS NULL THEN
  UPDATE bricklab.commerce_orders SET payment_id=p_payment WHERE id=o.id;
 END IF;
 IF NOT bricklab.commerce_fulfill(p_order,p_payment,p_environment,p_amount) THEN
  RAISE EXCEPTION 'payment_mismatch';
 END IF;
 -- A success callback arriving after a full refund cannot restore access.
 -- Fulfillment and revocation commit together; no transient usable grant.
 IF p_refunded AND NOT bricklab.commerce_refund_full(p_payment,p_environment,p_amount) THEN
  RAISE EXCEPTION 'refund_mismatch';
 END IF;
 RETURN true;
 END $$;
CREATE FUNCTION bricklab.commerce_cancel_verified(p_order uuid,p_payment text,p_environment text,p_amount integer)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 BEGIN
 IF p_environment IS NULL OR p_environment NOT IN ('test','live') OR p_amount IS NULL
 OR p_payment IS NULL OR p_payment !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN false; END IF;
 UPDATE bricklab.commerce_orders o SET payment_id=p_payment,status='canceled'
 WHERE o.id=p_order AND o.provider='yookassa' AND o.environment=p_environment AND o.amount_kopecks=p_amount
 AND o.status IN ('pending','canceled') AND (o.payment_id IS NULL OR o.payment_id=p_payment)
 AND (o.environment='test' OR (o.offer_version IS NOT NULL AND o.accepted_at IS NOT NULL));
 RETURN FOUND;
 END $$;
-- The normal checkout POST may finish after a webhook has already settled it.
CREATE OR REPLACE FUNCTION bricklab.commerce_attach_payment(p_order uuid,p_payment text,p_environment text) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 BEGIN
 IF p_environment IS NULL OR p_environment NOT IN ('test','live') OR p_payment IS NULL THEN RETURN false; END IF;
 UPDATE bricklab.commerce_orders SET payment_id=p_payment WHERE id=p_order AND environment=p_environment AND status='pending'
 AND (environment='test' OR (offer_version IS NOT NULL AND accepted_at IS NOT NULL))
 AND (payment_id IS NULL OR payment_id=p_payment);
 IF FOUND THEN RETURN true; END IF;
 RETURN EXISTS(SELECT 1 FROM bricklab.commerce_orders WHERE id=p_order AND environment=p_environment AND payment_id=p_payment AND status IN ('succeeded','canceled','refunded'));
 END $$;
-- A lost refund-create response can leave the refund ID unknown. Poll the
-- existing payment's refunded_amount, never create another refund in a worker.
CREATE OR REPLACE FUNCTION bricklab.commerce_claim_refunds(p_environment text)
 RETURNS TABLE(id uuid,payment_id text,amount_kopecks integer,provider_refund_id text)
 LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 WITH due AS (SELECT o.id FROM bricklab.commerce_orders o WHERE o.environment=p_environment AND o.status='succeeded'
 AND o.payment_id IS NOT NULL AND (o.provider_refund_id IS NOT NULL OR o.refund_requested_at IS NOT NULL)
 AND o.next_payment_check_at<=now() ORDER BY o.next_payment_check_at,o.id LIMIT 5 FOR UPDATE SKIP LOCKED)
 UPDATE bricklab.commerce_orders o SET next_payment_check_at=now()+interval '5 minutes'
 FROM due WHERE o.id=due.id RETURNING o.id,o.payment_id,o.amount_kopecks,o.provider_refund_id
 $$;
REVOKE ALL ON FUNCTION bricklab.commerce_settle_verified(uuid,text,text,integer,boolean),bricklab.commerce_cancel_verified(uuid,text,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.commerce_settle_verified(uuid,text,text,integer,boolean),bricklab.commerce_cancel_verified(uuid,text,text,integer) TO bricklab_app;
