-- Trusted server payment adapter; no direct write privileges on the ledger.
-- Checkout currently permits test orders only. A later approved release may
-- create live orders using a separately reviewed quote/consent flow.
CREATE FUNCTION bricklab.commerce_create_test_order(p_sku text) RETURNS SETOF bricklab.commerce_orders
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 DECLARE uid uuid; price integer; label text; existing bricklab.commerce_orders%ROWTYPE;
 BEGIN
 uid:=nullif(current_setting('bricklab.user_id',true),'')::uuid;
 IF uid IS NULL OR NOT EXISTS(SELECT 1 FROM bricklab.admin_accounts a WHERE a.user_id=uid) THEN RAISE EXCEPTION 'admin_required'; END IF;
 SELECT v.price,v.label INTO price,label FROM (VALUES
 ('slots-20',9900,'+20 проектов'),('slots-30',12900,'+30 проектов'),('slots-100',34900,'+100 проектов'),
 ('supporter',4900,'Supporter'),('bronze-builder',14900,'Bronze Builder'),('silver-builder',29900,'Silver Builder'),
 ('gold-builder',59900,'Gold Builder'),('diamond-patron',99900,'Diamond Patron'),('founders-club',149900,'Founder’s Club'),
 ('theme-collection',69900,'Signature Collection'),('carbon',9900,'Carbon GT'),('neon',14900,'Neon Circuit'),
 ('blueprint',12900,'Blueprint Studio'),('titanium',17900,'Titanium Factory'),('ember',19900,'Ember Forge'),('aurora',19900,'Aurora Lab'),
 ('plus-1',24900,'BrickLab Plus · 1 месяц'),('plus-3',64900,'BrickLab Plus · 3 месяца'),('plus-12',249000,'BrickLab Plus · 12 месяцев')
 ) AS v(sku,price,label) WHERE v.sku=p_sku;
 IF price IS NULL THEN RAISE EXCEPTION 'unknown_product'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,312042));
 SELECT * INTO existing FROM bricklab.commerce_orders o WHERE o.user_id=uid AND o.environment='test' AND o.sku=p_sku AND o.status='pending' ORDER BY o.created_at DESC LIMIT 1;
 IF FOUND THEN RETURN NEXT existing; RETURN; END IF;
 RETURN QUERY INSERT INTO bricklab.commerce_orders(user_id,sku,title,amount_kopecks,provider,environment)
 VALUES(uid,p_sku,label,price,'yookassa','test') RETURNING *;
 END $$;
CREATE FUNCTION bricklab.commerce_attach_payment(p_order uuid,p_payment text,p_environment text) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 BEGIN
 IF p_environment IS DISTINCT FROM 'test' THEN RETURN false; END IF;
 UPDATE bricklab.commerce_orders SET payment_id=p_payment WHERE id=p_order AND environment=p_environment AND status='pending'
 AND (payment_id IS NULL OR payment_id=p_payment);
 RETURN FOUND;
 END $$;
-- Called only after server-to-provider GET verifies payment status, currency,
-- amount, mode and order metadata. Serialize fulfillment and renewal by owner.
CREATE FUNCTION bricklab.commerce_fulfill(p_order uuid,p_payment text,p_environment text,p_amount integer) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 DECLARE o bricklab.commerce_orders%ROWTYPE; uid uuid; k text; target_id text:=''; months integer; starts timestamptz; ends timestamptz;
 BEGIN
 IF p_environment IS DISTINCT FROM 'test' THEN RETURN false; END IF;
 SELECT user_id INTO uid FROM bricklab.commerce_orders WHERE id=p_order;
 IF uid IS NULL THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,312042));
 SELECT * INTO o FROM bricklab.commerce_orders WHERE id=p_order FOR UPDATE;
 IF o.environment<>p_environment OR o.amount_kopecks<>p_amount OR o.payment_id IS DISTINCT FROM p_payment OR p_payment IS NULL THEN RETURN false; END IF;
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
 UPDATE bricklab.commerce_orders SET status='succeeded',paid_at=now() WHERE id=o.id;
 INSERT INTO bricklab.commerce_grants(order_id,user_id,kind,sku,target,granted_at,expires_at)
 VALUES(o.id,uid,k,o.sku,target_id,starts,ends);
 RETURN true;
 END $$;
REVOKE ALL ON FUNCTION bricklab.commerce_create_test_order(text),bricklab.commerce_attach_payment(uuid,text,text),bricklab.commerce_fulfill(uuid,text,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.commerce_create_test_order(text),bricklab.commerce_attach_payment(uuid,text,text),bricklab.commerce_fulfill(uuid,text,text,integer) TO bricklab_app;
CREATE FUNCTION bricklab.public_plus(profile_id uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 SELECT EXISTS(SELECT 1 FROM bricklab.public_profiles p JOIN bricklab.commerce_grants g ON g.user_id=p.user_id
 JOIN bricklab.commerce_orders o ON o.id=g.order_id AND o.user_id=g.user_id
 WHERE p.public_id=profile_id AND p.background_theme IS NOT NULL AND g.kind='subscription' AND g.revoked_at IS NULL
 AND g.granted_at<=now() AND g.expires_at>now() AND o.environment='live' AND o.status='succeeded')
 $$;
REVOKE ALL ON FUNCTION bricklab.public_plus(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.public_plus(uuid) TO bricklab_app;
