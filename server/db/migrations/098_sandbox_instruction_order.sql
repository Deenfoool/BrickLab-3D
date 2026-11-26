-- Isolated instruction checkout fixture: trusted catalog inventory 2359 non-spare parts (179 RUB tier).
-- During open beta it does not lock PDF or affect real access.
-- Trusted server payment adapter; no direct write privileges on the ledger.
-- Checkout currently permits test orders only. A later approved release may
-- create live orders using a separately reviewed quote/consent flow.
CREATE OR REPLACE FUNCTION bricklab.commerce_create_test_order(p_sku text) RETURNS SETOF bricklab.commerce_orders
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
 ('instruction-42215-1',17900,'Интерактивные инструкции · Volvo 42215 (тест)'),
 ('plus-1',24900,'BrickLab Plus · 1 месяц'),('plus-3',64900,'BrickLab Plus · 3 месяца'),('plus-12',249000,'BrickLab Plus · 12 месяцев')
 ) AS v(sku,price,label) WHERE v.sku=p_sku;
 IF price IS NULL THEN RAISE EXCEPTION 'unknown_product'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,312042));
 SELECT * INTO existing FROM bricklab.commerce_orders o WHERE o.user_id=uid AND o.environment='test' AND o.sku=p_sku AND o.status='pending' ORDER BY o.created_at DESC LIMIT 1;
 IF FOUND THEN RETURN NEXT existing; RETURN; END IF;
 RETURN QUERY INSERT INTO bricklab.commerce_orders(user_id,sku,title,amount_kopecks,provider,environment)
 VALUES(uid,p_sku,label,price,'yookassa','test') RETURNING *;
 END $$;
