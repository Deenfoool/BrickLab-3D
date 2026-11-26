-- Fiscal receipt generation remains external (My Tax or an authorized partner).
-- The operator confirms an already generated receipt link, then the durable
-- delivery queue sends that link to the verified customer email.
ALTER TABLE bricklab.commerce_orders ADD COLUMN receipt_delivery_url text,
 ADD COLUMN receipt_delivery_next_at timestamptz,
 ADD COLUMN receipt_delivery_sent_at timestamptz,
 ADD CONSTRAINT commerce_receipt_url CHECK (receipt_delivery_url IS NULL OR receipt_delivery_url ~ '^https://lknpd\.nalog\.ru/api/v1/receipt/[0-9]{12}/[A-Za-z0-9_-]{1,80}/print$');
CREATE UNIQUE INDEX commerce_receipt_unique_url ON bricklab.commerce_orders(receipt_delivery_url) WHERE receipt_delivery_url IS NOT NULL;
CREATE INDEX commerce_receipt_delivery_due ON bricklab.commerce_orders(receipt_delivery_next_at) WHERE environment='live' AND status='succeeded' AND receipt_delivery_url IS NOT NULL AND receipt_delivery_sent_at IS NULL;
CREATE FUNCTION bricklab.commerce_register_receipt(p_order uuid,p_url text) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 DECLARE uid uuid;
 BEGIN
 uid:=nullif(current_setting('bricklab.user_id',true),'')::uuid;
 IF uid IS NULL OR NOT bricklab.is_admin() THEN RAISE EXCEPTION 'admin_required'; END IF;
 IF p_url IS NULL OR p_url !~ '^https://lknpd\.nalog\.ru/api/v1/receipt/[0-9]{12}/[A-Za-z0-9_-]{1,80}/print$' THEN RETURN false; END IF;
 UPDATE bricklab.commerce_orders o SET receipt_status='issued',receipt_reference=p_url,receipt_confirmed_at=now(),receipt_confirmed_by=uid,receipt_delivery_url=p_url,receipt_delivery_next_at=now()
 WHERE o.id=p_order AND o.environment='live' AND o.status='succeeded' AND o.receipt_status='pending';
 RETURN FOUND;
 END $$;
CREATE FUNCTION bricklab.commerce_claim_receipt_deliveries()
 RETURNS TABLE(id uuid,order_number bigint,title text,amount_kopecks integer,email text,receipt_url text)
 LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 WITH due AS (SELECT o.id FROM bricklab.commerce_orders o WHERE o.environment='live' AND o.status='succeeded' AND o.receipt_status='issued' AND o.receipt_delivery_url IS NOT NULL AND o.receipt_delivery_sent_at IS NULL AND o.receipt_delivery_next_at<=now()
 ORDER BY o.receipt_delivery_next_at,o.id LIMIT 5 FOR UPDATE SKIP LOCKED),
 claimed AS (UPDATE bricklab.commerce_orders o SET receipt_delivery_next_at=now()+interval '5 minutes' FROM due WHERE o.id=due.id RETURNING o.*)
 SELECT c.id,c.order_number,c.title,c.amount_kopecks,u.email::text,c.receipt_delivery_url FROM claimed c JOIN bricklab.users u ON u.id=c.user_id WHERE u.email_verified_at IS NOT NULL
 $$;
CREATE FUNCTION bricklab.commerce_ack_receipt_delivery(p_order uuid,p_url text) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 BEGIN
 UPDATE bricklab.commerce_orders SET receipt_delivery_sent_at=now() WHERE id=p_order AND environment='live' AND receipt_delivery_url=p_url AND receipt_delivery_sent_at IS NULL;
 RETURN FOUND;
 END $$;
REVOKE ALL ON FUNCTION bricklab.commerce_register_receipt(uuid,text),bricklab.commerce_claim_receipt_deliveries(),bricklab.commerce_ack_receipt_delivery(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.commerce_register_receipt(uuid,text),bricklab.commerce_claim_receipt_deliveries(),bricklab.commerce_ack_receipt_delivery(uuid,text) TO bricklab_app;
DROP FUNCTION bricklab.commerce_admin_ledger(text);
CREATE FUNCTION bricklab.commerce_admin_ledger(p_environment text)
 RETURNS TABLE(id uuid,user_id uuid,display_name text,email text,sku text,title text,amount_kopecks integer,status text,receipt_status text,receipt_reference text,created_at timestamptz,paid_at timestamptz,refund_requested_at timestamptz,provider_refund_id text,receipt_correction_pending boolean,receipt_correction_reference text,order_number bigint,receipt_delivery_url text,receipt_delivery_sent_at timestamptz)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 BEGIN
 IF NOT bricklab.is_admin() THEN RAISE EXCEPTION 'admin_required'; END IF;
 IF p_environment IS NULL OR p_environment NOT IN ('test','live') THEN RAISE EXCEPTION 'invalid_environment'; END IF;
 RETURN QUERY SELECT o.id,o.user_id,coalesce(nullif(p.display_name,''),u.display_name)::text,u.email::text,o.sku,o.title,o.amount_kopecks,o.status,o.receipt_status,o.receipt_reference,o.created_at,o.paid_at,o.refund_requested_at,o.provider_refund_id,o.receipt_correction_pending,o.receipt_correction_reference,o.order_number,o.receipt_delivery_url,o.receipt_delivery_sent_at
 FROM bricklab.commerce_orders o JOIN bricklab.users u ON u.id=o.user_id LEFT JOIN bricklab.profiles p ON p.user_id=o.user_id
 WHERE o.environment=p_environment ORDER BY (o.environment='live' AND (o.receipt_correction_pending OR (o.status='succeeded' AND (o.receipt_status='pending' OR (o.receipt_delivery_url IS NOT NULL AND o.receipt_delivery_sent_at IS NULL))))) DESC,o.created_at DESC LIMIT 100;
 END $$;
REVOKE ALL ON FUNCTION bricklab.commerce_admin_ledger(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.commerce_admin_ledger(text) TO bricklab_app;
