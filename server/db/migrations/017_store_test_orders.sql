-- Test-only commerce. No entitlement from this schema may unlock a real product.
CREATE TABLE bricklab.store_products (
 sku text PRIMARY KEY CHECK(sku IN ('carbon','neon')),
 title text NOT NULL, amount_kopecks integer NOT NULL CHECK(amount_kopecks BETWEEN 100 AND 10000000),
 active boolean NOT NULL DEFAULT true
);
INSERT INTO bricklab.store_products(sku,title,amount_kopecks) VALUES
 ('carbon','Фон мастерской Карбон',9900),('neon','Фон Неоновая мастерская',14900);
GRANT SELECT ON bricklab.store_products TO bricklab_app;
CREATE TABLE bricklab.store_test_orders (
 invoice integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES bricklab.users(id) ON DELETE RESTRICT,
 sku text NOT NULL REFERENCES bricklab.store_products(sku),
 amount_kopecks integer NOT NULL CHECK(amount_kopecks>0),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid')),
 created_at timestamptz NOT NULL DEFAULT now(),
 paid_at timestamptz,
 CHECK((status='paid')=(paid_at IS NOT NULL))
);
CREATE UNIQUE INDEX store_test_one_order_per_item ON bricklab.store_test_orders(user_id,sku);
ALTER TABLE bricklab.store_test_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY store_test_orders_read ON bricklab.store_test_orders FOR SELECT TO bricklab_app
 USING(user_id=nullif(current_setting('bricklab.user_id',true),'')::uuid OR bricklab.is_admin());
GRANT SELECT ON bricklab.store_test_orders TO bricklab_app;
CREATE TABLE bricklab.store_test_entitlements (
 user_id uuid NOT NULL REFERENCES bricklab.users(id) ON DELETE RESTRICT,
 sku text NOT NULL REFERENCES bricklab.store_products(sku),
 invoice integer NOT NULL UNIQUE REFERENCES bricklab.store_test_orders(invoice),
 granted_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,sku)
);
ALTER TABLE bricklab.store_test_entitlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY store_test_entitlements_read ON bricklab.store_test_entitlements FOR SELECT TO bricklab_app
 USING(user_id=nullif(current_setting('bricklab.user_id',true),'')::uuid OR bricklab.is_admin());
GRANT SELECT ON bricklab.store_test_entitlements TO bricklab_app;
CREATE FUNCTION bricklab.create_test_order(product text) RETURNS bricklab.store_test_orders
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE uid uuid:=nullif(current_setting('bricklab.user_id',true),'')::uuid;
 p bricklab.store_products; o bricklab.store_test_orders;
BEGIN
 IF uid IS NULL OR NOT bricklab.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO p FROM bricklab.store_products WHERE sku=product AND active;
 IF NOT FOUND THEN RAISE EXCEPTION 'unknown product' USING ERRCODE='22023'; END IF;
 INSERT INTO bricklab.store_test_orders(user_id,sku,amount_kopecks) VALUES(uid,p.sku,p.amount_kopecks)
 ON CONFLICT(user_id,sku) DO NOTHING;
 SELECT * INTO o FROM bricklab.store_test_orders WHERE user_id=uid AND sku=p.sku;
 RETURN o;
END $$;
REVOKE ALL ON FUNCTION bricklab.create_test_order(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.create_test_order(text) TO bricklab_app;
-- Called only after application verifies Robokassa test Password #2 and exact amount.
-- Row lock and transaction guarantee idempotent confirmation and atomic test item delivery.
CREATE FUNCTION bricklab.confirm_test_order(number integer, amount integer) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE o bricklab.store_test_orders;
BEGIN
 SELECT * INTO o FROM bricklab.store_test_orders WHERE invoice=number FOR UPDATE;
 IF NOT FOUND OR o.amount_kopecks<>amount THEN RETURN false; END IF;
 IF o.status='paid' THEN RETURN true; END IF;
 UPDATE bricklab.store_test_orders SET status='paid',paid_at=now() WHERE invoice=number;
 INSERT INTO bricklab.store_test_entitlements(user_id,sku,invoice) VALUES(o.user_id,o.sku,o.invoice);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION bricklab.confirm_test_order(integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.confirm_test_order(integer,integer) TO bricklab_app;
