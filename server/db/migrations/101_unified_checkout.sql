-- One trusted quote/consent workflow for both provider environments.
-- Legacy sandbox orders remain sandbox orders forever.
CREATE FUNCTION bricklab.commerce_create_order(p_sku text,p_title text,p_amount integer,p_offer_version text,p_environment text) RETURNS SETOF bricklab.commerce_orders
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 DECLARE uid uuid; existing bricklab.commerce_orders%ROWTYPE;
 BEGIN
 uid:=nullif(current_setting('bricklab.user_id',true),'')::uuid;
 IF p_environment IS NULL OR p_environment NOT IN ('test','live') THEN RAISE EXCEPTION 'invalid_environment'; END IF;
 IF uid IS NULL OR NOT EXISTS(SELECT 1 FROM bricklab.users u WHERE u.id=uid AND u.blocked_at IS NULL AND u.email_verified_at IS NOT NULL) THEN RAISE EXCEPTION 'verified_account_required'; END IF;
 IF p_environment='test' AND NOT EXISTS(SELECT 1 FROM bricklab.admin_accounts a WHERE a.user_id=uid) THEN RAISE EXCEPTION 'admin_required'; END IF;
 IF p_offer_version IS NULL OR p_offer_version !~ '^[a-f0-9]{64}$' OR p_amount IS NULL OR p_amount<1 OR p_amount>10000000 OR p_title IS NULL OR length(p_title) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'invalid_quote'; END IF;
 IF p_sku IS NULL OR NOT (p_sku IN ('slots-20','slots-30','slots-100','supporter','bronze-builder','silver-builder','gold-builder','diamond-patron','founders-club','theme-collection','carbon','neon','blueprint','titanium','ember','aurora','plus-1','plus-3','plus-12') OR p_sku ~ '^instruction-[0-9]{1,12}-[0-9]{1,4}$') THEN RAISE EXCEPTION 'unknown_product'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,312042));
 SELECT * INTO existing FROM bricklab.commerce_orders o WHERE o.user_id=uid AND o.environment=p_environment AND o.status='pending' AND (p_environment='live' OR o.sku=p_sku) ORDER BY o.created_at DESC LIMIT 1;
 IF FOUND THEN
  IF existing.sku<>p_sku OR existing.amount_kopecks<>p_amount OR (existing.offer_version IS NOT NULL AND existing.offer_version<>p_offer_version) THEN RAISE EXCEPTION 'checkout_pending'; END IF;
  IF existing.offer_version IS NULL THEN
   UPDATE bricklab.commerce_orders SET offer_version=p_offer_version,accepted_at=now() WHERE id=existing.id RETURNING * INTO existing;
  END IF;
  RETURN NEXT existing; RETURN;
 END IF;
 RETURN QUERY INSERT INTO bricklab.commerce_orders(user_id,sku,title,amount_kopecks,provider,environment,offer_version,accepted_at)
 VALUES(uid,p_sku,p_title,p_amount,'yookassa',p_environment,p_offer_version,now()) RETURNING *;
 END $$;
REVOKE ALL ON FUNCTION bricklab.commerce_create_order(text,text,integer,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.commerce_create_order(text,text,integer,text,text) TO bricklab_app;
-- The same admin workflow is used for test and live full refunds. For live,
-- the admin may refund any customer; sandbox remains owner restricted.
CREATE FUNCTION bricklab.commerce_request_refund(p_order uuid,p_environment text)
 RETURNS TABLE(id uuid,payment_id text,amount_kopecks integer,refund_requested_at timestamptz,provider_refund_id text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 DECLARE uid uuid;
 BEGIN
 uid:=nullif(current_setting('bricklab.user_id',true),'')::uuid;
 IF uid IS NULL OR NOT EXISTS(SELECT 1 FROM bricklab.admin_accounts a WHERE a.user_id=uid) THEN RAISE EXCEPTION 'admin_required'; END IF;
 IF p_environment IS NULL OR p_environment NOT IN ('test','live') THEN RAISE EXCEPTION 'invalid_environment'; END IF;
 RETURN QUERY UPDATE bricklab.commerce_orders o SET refund_requested_at=coalesce(o.refund_requested_at,now())
 WHERE o.id=p_order AND (p_environment='live' OR o.user_id=uid) AND o.environment=p_environment AND o.status='succeeded' AND o.payment_id IS NOT NULL
 RETURNING o.id,o.payment_id,o.amount_kopecks,o.refund_requested_at,o.provider_refund_id;
 END $$;
CREATE FUNCTION bricklab.commerce_attach_refund(p_order uuid,p_refund text,p_environment text) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 BEGIN
 UPDATE bricklab.commerce_orders o SET provider_refund_id=p_refund
 WHERE o.id=p_order AND o.environment=p_environment AND o.refund_requested_at IS NOT NULL AND o.status IN ('succeeded','refunded')
 AND (o.provider_refund_id IS NULL OR o.provider_refund_id=p_refund);
 RETURN FOUND;
 END $$;
CREATE FUNCTION bricklab.commerce_claim_refunds(p_environment text)
 RETURNS TABLE(id uuid,payment_id text,amount_kopecks integer,provider_refund_id text)
 LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 WITH due AS (SELECT o.id FROM bricklab.commerce_orders o WHERE o.environment=p_environment AND o.status='succeeded'
 AND o.provider_refund_id IS NOT NULL AND o.next_payment_check_at<=now() ORDER BY o.next_payment_check_at,o.id LIMIT 5 FOR UPDATE SKIP LOCKED)
 UPDATE bricklab.commerce_orders o SET next_payment_check_at=now()+interval '5 minutes'
 FROM due WHERE o.id=due.id RETURNING o.id,o.payment_id,o.amount_kopecks,o.provider_refund_id
 $$;
REVOKE ALL ON FUNCTION bricklab.commerce_request_refund(uuid,text),bricklab.commerce_attach_refund(uuid,text,text),bricklab.commerce_claim_refunds(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.commerce_request_refund(uuid,text),bricklab.commerce_attach_refund(uuid,text,text),bricklab.commerce_claim_refunds(text) TO bricklab_app;
