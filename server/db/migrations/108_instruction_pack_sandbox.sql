-- Sandbox only. No live bundle orders can be created by this migration.
CREATE TABLE bricklab.instruction_pack_lines (
 order_id uuid NOT NULL REFERENCES bricklab.commerce_orders(id) ON DELETE RESTRICT,
 set_id text NOT NULL CHECK(set_id ~ '^[0-9]{3,7}-[0-9]{1,2}$'),
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 150),
 base_kopecks integer NOT NULL CHECK(base_kopecks IN (7900,12900,17900,24900)),
 amount_kopecks integer NOT NULL CHECK(amount_kopecks>0 AND amount_kopecks<=base_kopecks),
 PRIMARY KEY(order_id,set_id)
);
ALTER TABLE bricklab.instruction_pack_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY instruction_pack_owner ON bricklab.instruction_pack_lines FOR SELECT TO bricklab_app
 USING(EXISTS(SELECT 1 FROM bricklab.commerce_orders o WHERE o.id=order_id AND o.user_id::text=nullif(current_setting('bricklab.user_id',true),'')));
REVOKE ALL ON bricklab.instruction_pack_lines FROM PUBLIC,bricklab_app;
GRANT SELECT ON bricklab.instruction_pack_lines TO bricklab_app;

CREATE FUNCTION bricklab.commerce_create_test_pack(p_sku text,p_title text,p_amount integer,p_offer text,p_lines jsonb)
 RETURNS SETOF bricklab.commerce_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 DECLARE uid uuid; existing bricklab.commerce_orders%ROWTYPE; order_row bricklab.commerce_orders%ROWTYPE; ids text[]; n integer; total integer; base integer;
 BEGIN
 uid:=nullif(current_setting('bricklab.user_id',true),'')::uuid;
 IF uid IS NULL OR NOT EXISTS(SELECT 1 FROM bricklab.users u JOIN bricklab.admin_accounts a ON a.user_id=u.id WHERE u.id=uid AND u.blocked_at IS NULL AND u.email_verified_at IS NOT NULL) THEN RAISE EXCEPTION 'verified_account_required'; END IF;
 IF p_offer IS NULL OR p_offer !~ '^[a-f0-9]{64}$' OR p_amount IS NULL OR p_amount<1 OR p_title IS NULL OR length(p_title) NOT BETWEEN 1 AND 200 OR p_lines IS NULL OR jsonb_typeof(p_lines)<>'array' OR jsonb_array_length(p_lines)<>3 THEN RAISE EXCEPTION 'invalid_quote'; END IF;
 SELECT array_agg(l."setId" ORDER BY l."setId" COLLATE "C"),count(DISTINCT l."setId"),sum(l.amount),sum(l.base) INTO ids,n,total,base
 FROM jsonb_to_recordset(p_lines) AS l("setId" text,title text,base integer,amount integer)
 WHERE l."setId" ~ '^[0-9]{3,7}-[0-9]{1,2}$' AND length(l.title) BETWEEN 1 AND 150 AND l.base IN (7900,12900,17900,24900) AND l.amount BETWEEN 1 AND l.base;
 IF n<>3 OR total IS DISTINCT FROM p_amount OR round(base::numeric*.85)::integer IS DISTINCT FROM p_amount OR p_sku IS DISTINCT FROM 'instruction-pack:'||array_to_string(ids,',') THEN RAISE EXCEPTION 'invalid_quote'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,312042));
 SELECT * INTO existing FROM bricklab.commerce_orders o WHERE o.user_id=uid AND o.environment='test' AND o.sku=p_sku AND o.status='pending' LIMIT 1;
 IF FOUND THEN
  IF existing.amount_kopecks<>p_amount OR existing.offer_version IS DISTINCT FROM p_offer THEN RAISE EXCEPTION 'checkout_pending'; END IF;
  RETURN NEXT existing; RETURN;
 END IF;
 IF EXISTS(SELECT 1 FROM bricklab.commerce_orders o WHERE o.user_id=uid AND o.environment='test' AND o.status='pending' AND (o.sku=ANY(ARRAY(SELECT 'instruction-'||x FROM unnest(ids) x)) OR EXISTS(SELECT 1 FROM bricklab.instruction_pack_lines l WHERE l.order_id=o.id AND l.set_id=ANY(ids)))) THEN RAISE EXCEPTION 'checkout_pending'; END IF;
 IF EXISTS(SELECT 1 FROM bricklab.commerce_grants g JOIN bricklab.commerce_orders o ON o.id=g.order_id AND o.user_id=g.user_id WHERE g.user_id=uid AND o.environment='test' AND o.status='succeeded' AND g.kind='instruction' AND g.revoked_at IS NULL AND g.target=ANY(ids)) THEN RAISE EXCEPTION 'already_owned'; END IF;
 INSERT INTO bricklab.commerce_orders(user_id,sku,title,amount_kopecks,provider,environment,offer_version,accepted_at)
 VALUES(uid,p_sku,p_title,p_amount,'yookassa','test',p_offer,now()) RETURNING * INTO order_row;
 INSERT INTO bricklab.instruction_pack_lines(order_id,set_id,title,base_kopecks,amount_kopecks)
 SELECT order_row.id,l."setId",l.title,l.base,l.amount FROM jsonb_to_recordset(p_lines) AS l("setId" text,title text,base integer,amount integer);
 RETURN NEXT order_row;
 END $$;
REVOKE ALL ON FUNCTION bricklab.commerce_create_test_pack(text,text,integer,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.commerce_create_test_pack(text,text,integer,text,jsonb) TO bricklab_app;

-- Legacy and unified individual sandbox checkouts must respect pack reservations.
CREATE FUNCTION bricklab.guard_instruction_pack_reservation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 BEGIN
 IF NEW.environment='test' AND NEW.status='pending' AND NEW.sku ~ '^instruction-[0-9]{1,12}-[0-9]{1,4}$' AND EXISTS(
  SELECT 1 FROM bricklab.instruction_pack_lines l JOIN bricklab.commerce_orders o ON o.id=l.order_id
  WHERE o.user_id=NEW.user_id AND o.environment='test' AND o.status='pending' AND l.set_id=substring(NEW.sku from 13)
 ) THEN RAISE EXCEPTION 'checkout_pending'; END IF;
 RETURN NEW;
 END $$;
REVOKE ALL ON FUNCTION bricklab.guard_instruction_pack_reservation() FROM PUBLIC,bricklab_app;
CREATE TRIGGER guard_instruction_pack_reservation BEFORE INSERT ON bricklab.commerce_orders FOR EACH ROW EXECUTE FUNCTION bricklab.guard_instruction_pack_reservation();

-- Preserve existing fulfillment implementation for every existing SKU.
ALTER FUNCTION bricklab.commerce_fulfill(uuid,text,text,integer) RENAME TO commerce_fulfill_single;
REVOKE ALL ON FUNCTION bricklab.commerce_fulfill_single(uuid,text,text,integer) FROM PUBLIC,bricklab_app;
CREATE FUNCTION bricklab.commerce_fulfill(p_order uuid,p_payment text,p_environment text,p_amount integer) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 DECLARE o bricklab.commerce_orders%ROWTYPE; uid uuid; n integer; total integer;
 BEGIN
 SELECT user_id INTO uid FROM bricklab.commerce_orders WHERE id=p_order AND sku LIKE 'instruction-pack:%';
 IF uid IS NULL THEN RETURN bricklab.commerce_fulfill_single(p_order,p_payment,p_environment,p_amount); END IF;
 IF p_environment IS DISTINCT FROM 'test' OR p_payment IS NULL OR p_amount IS NULL THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,312042));
 SELECT * INTO o FROM bricklab.commerce_orders WHERE id=p_order FOR UPDATE;
 IF o.environment<>'test' OR o.amount_kopecks<>p_amount OR o.payment_id IS DISTINCT FROM p_payment OR o.offer_version IS NULL OR o.accepted_at IS NULL THEN RETURN false; END IF;
 IF o.status='succeeded' THEN RETURN true; END IF;
 IF o.status<>'pending' THEN RETURN false; END IF;
 SELECT count(*),sum(amount_kopecks) INTO n,total FROM bricklab.instruction_pack_lines WHERE order_id=o.id;
 IF n<>3 OR total IS DISTINCT FROM o.amount_kopecks THEN RETURN false; END IF;
 INSERT INTO bricklab.commerce_grants(order_id,user_id,kind,sku,target)
 SELECT o.id,uid,'instruction','instruction-'||l.set_id,l.set_id FROM bricklab.instruction_pack_lines l WHERE l.order_id=o.id;
 UPDATE bricklab.commerce_orders SET status='succeeded',paid_at=now(),receipt_status='not_required' WHERE id=o.id;
 RETURN true;
 END $$;
REVOKE ALL ON FUNCTION bricklab.commerce_fulfill(uuid,text,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.commerce_fulfill(uuid,text,text,integer) TO bricklab_app;
