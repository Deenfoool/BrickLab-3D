-- Live checkout is not enabled by this migration. Only a server-authorized quote
-- with the exact accepted legal document digest may create a live order.
ALTER TABLE bricklab.commerce_orders ADD COLUMN offer_version text CHECK(offer_version IS NULL OR offer_version ~ '^[a-f0-9]{64}$'),
 ADD COLUMN accepted_at timestamptz,
 ADD COLUMN receipt_status text NOT NULL DEFAULT 'not_required' CHECK(receipt_status IN ('not_required','pending','issued')),
 ADD CONSTRAINT commerce_offer_acceptance_pair CHECK ((offer_version IS NULL)=(accepted_at IS NULL));
CREATE UNIQUE INDEX commerce_one_pending_live_per_owner ON bricklab.commerce_orders(user_id) WHERE environment='live' AND status='pending';
CREATE FUNCTION bricklab.commerce_create_live_order(p_sku text,p_title text,p_amount integer,p_offer_version text) RETURNS SETOF bricklab.commerce_orders
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 DECLARE uid uuid; existing bricklab.commerce_orders%ROWTYPE;
 BEGIN
 uid:=nullif(current_setting('bricklab.user_id',true),'')::uuid;
 IF uid IS NULL OR NOT EXISTS(SELECT 1 FROM bricklab.users u WHERE u.id=uid AND u.blocked_at IS NULL AND u.email_verified_at IS NOT NULL) THEN RAISE EXCEPTION 'verified_account_required'; END IF;
 IF p_offer_version IS NULL OR p_offer_version !~ '^[a-f0-9]{64}$' OR p_amount IS NULL OR p_amount<1 OR p_amount>10000000 OR p_title IS NULL OR length(p_title) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'invalid_quote'; END IF;
 IF p_sku IS NULL OR NOT (p_sku IN ('slots-20','slots-30','slots-100','supporter','bronze-builder','silver-builder','gold-builder','diamond-patron','founders-club','theme-collection','carbon','neon','blueprint','titanium','ember','aurora','plus-1','plus-3','plus-12') OR p_sku ~ '^instruction-[0-9]{1,12}-[0-9]{1,4}$') THEN RAISE EXCEPTION 'unknown_product'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,312042));
 SELECT * INTO existing FROM bricklab.commerce_orders o WHERE o.user_id=uid AND o.environment='live' AND o.status='pending' LIMIT 1;
 IF FOUND THEN
  IF existing.sku<>p_sku OR existing.amount_kopecks<>p_amount OR existing.offer_version IS DISTINCT FROM p_offer_version THEN RAISE EXCEPTION 'checkout_pending'; END IF;
  RETURN NEXT existing; RETURN;
 END IF;
 RETURN QUERY INSERT INTO bricklab.commerce_orders(user_id,sku,title,amount_kopecks,provider,environment,offer_version,accepted_at)
 VALUES(uid,p_sku,p_title,p_amount,'yookassa','live',p_offer_version,now()) RETURNING *;
 END $$;
REVOKE ALL ON FUNCTION bricklab.commerce_create_live_order(text,text,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.commerce_create_live_order(text,text,integer,text) TO bricklab_app;

CREATE OR REPLACE FUNCTION bricklab.commerce_attach_payment(p_order uuid,p_payment text,p_environment text) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 BEGIN
 IF p_environment IS NULL OR p_environment NOT IN ('test','live') THEN RETURN false; END IF;
 UPDATE bricklab.commerce_orders SET payment_id=p_payment WHERE id=p_order AND environment=p_environment AND status='pending'
 AND (environment='test' OR (offer_version IS NOT NULL AND accepted_at IS NOT NULL))
 AND (payment_id IS NULL OR payment_id=p_payment);
 RETURN FOUND;
 END $$;
-- Called only after server-to-provider GET verifies payment status, currency,
-- amount, mode and order metadata. Serialize fulfillment and renewal by owner.
CREATE OR REPLACE FUNCTION bricklab.commerce_fulfill(p_order uuid,p_payment text,p_environment text,p_amount integer) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 DECLARE o bricklab.commerce_orders%ROWTYPE; uid uuid; k text; target_id text:=''; months integer; starts timestamptz; ends timestamptz;
 BEGIN
 IF p_environment IS NULL OR p_environment NOT IN ('test','live') THEN RETURN false; END IF;
 SELECT user_id INTO uid FROM bricklab.commerce_orders WHERE id=p_order;
 IF uid IS NULL THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,312042));
 SELECT * INTO o FROM bricklab.commerce_orders WHERE id=p_order FOR UPDATE;
 IF o.environment<>p_environment OR o.amount_kopecks<>p_amount OR o.payment_id IS DISTINCT FROM p_payment OR p_payment IS NULL THEN RETURN false; END IF;
 IF o.environment='live' AND (o.offer_version IS NULL OR o.accepted_at IS NULL) THEN RETURN false; END IF;
 IF o.status='succeeded' THEN RETURN true; END IF;
 IF o.status<>'pending' THEN RETURN false; END IF;
 CASE
 WHEN o.sku IN ('slots-20','slots-30','slots-100') THEN k:='storage';
 WHEN o.sku IN ('supporter','bronze-builder','silver-builder','gold-builder','diamond-patron','founders-club') THEN k:='badge';
 WHEN o.sku='theme-collection' THEN k:='themeBundle';
 WHEN o.sku IN ('carbon','neon','blueprint','titanium','ember','aurora') THEN k:='theme';target_id:=o.sku;
 WHEN o.sku IN ('plus-1','plus-3','plus-12') THEN k:='subscription';months:=split_part(o.sku,'-',2)::integer;
 WHEN o.sku ~ '^instruction-[0-9]{1,12}-[0-9]{1,4}$' THEN k:='instruction';target_id:=substring(o.sku from 13);
 ELSE RETURN false;
 END CASE;
 starts:=now();
 IF k='subscription' THEN
  SELECT greatest(now(),coalesce(max(g.expires_at),now())) INTO starts FROM bricklab.commerce_grants g
   JOIN bricklab.commerce_orders previous ON previous.id=g.order_id AND previous.user_id=g.user_id
   WHERE g.user_id=uid AND g.kind='subscription' AND g.revoked_at IS NULL AND previous.environment=o.environment AND previous.status='succeeded';
  ends:=starts+make_interval(months=>months);
 END IF;
 UPDATE bricklab.commerce_orders SET status='succeeded',paid_at=now(),receipt_status=CASE WHEN o.environment='live' THEN 'pending' ELSE 'not_required' END WHERE id=o.id;
 INSERT INTO bricklab.commerce_grants(order_id,user_id,kind,sku,target,granted_at,expires_at)
 VALUES(o.id,uid,k,o.sku,target_id,starts,ends);
 RETURN true;
 END $$;

CREATE FUNCTION bricklab.commerce_cancel_payment(p_order uuid,p_payment text,p_environment text,p_amount integer) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 BEGIN
 UPDATE bricklab.commerce_orders SET status='canceled' WHERE id=p_order AND payment_id=p_payment AND environment=p_environment
 AND amount_kopecks=p_amount AND status IN ('pending','canceled');
 RETURN FOUND;
 END $$;
REVOKE ALL ON FUNCTION bricklab.commerce_cancel_payment(uuid,text,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.commerce_cancel_payment(uuid,text,text,integer) TO bricklab_app;
