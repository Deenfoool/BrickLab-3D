-- Refunds of real payments require a fiscal correction; track it separately.
ALTER TABLE bricklab.commerce_orders ADD COLUMN receipt_correction_reference text CHECK(receipt_correction_reference IS NULL OR length(receipt_correction_reference) BETWEEN 1 AND 250),
 ADD COLUMN receipt_corrected_at timestamptz,
 ADD COLUMN receipt_corrected_by uuid REFERENCES bricklab.users(id) ON DELETE RESTRICT;
DROP FUNCTION bricklab.commerce_admin_ledger(text);
CREATE FUNCTION bricklab.commerce_admin_ledger(p_environment text)
 RETURNS TABLE(id uuid,user_id uuid,display_name text,email text,sku text,title text,amount_kopecks integer,status text,receipt_status text,receipt_reference text,created_at timestamptz,paid_at timestamptz,refund_requested_at timestamptz,provider_refund_id text,receipt_correction_pending boolean,receipt_correction_reference text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 BEGIN
 IF NOT bricklab.is_admin() THEN RAISE EXCEPTION 'admin_required'; END IF;
 IF p_environment IS NULL OR p_environment NOT IN ('test','live') THEN RAISE EXCEPTION 'invalid_environment'; END IF;
 RETURN QUERY SELECT o.id,o.user_id,u.display_name::text,u.email::text,o.sku,o.title,o.amount_kopecks,o.status,o.receipt_status,o.receipt_reference,o.created_at,o.paid_at,o.refund_requested_at,o.provider_refund_id,o.receipt_correction_pending,o.receipt_correction_reference
 FROM bricklab.commerce_orders o JOIN bricklab.users u ON u.id=o.user_id
 WHERE o.environment=p_environment ORDER BY o.created_at DESC LIMIT 100;
 END $$;
CREATE FUNCTION bricklab.commerce_confirm_receipt_correction(p_order uuid,p_reference text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 DECLARE uid uuid;
 BEGIN
 uid:=nullif(current_setting('bricklab.user_id',true),'')::uuid;
 IF uid IS NULL OR NOT bricklab.is_admin() THEN RAISE EXCEPTION 'admin_required'; END IF;
 IF p_reference IS NULL OR length(trim(p_reference)) NOT BETWEEN 1 AND 250 THEN RETURN false; END IF;
 UPDATE bricklab.commerce_orders o SET receipt_correction_pending=false,receipt_correction_reference=trim(p_reference),receipt_corrected_at=now(),receipt_corrected_by=uid
 WHERE o.id=p_order AND o.environment='live' AND o.status='refunded' AND o.receipt_correction_pending;
 RETURN FOUND;
 END $$;
REVOKE ALL ON FUNCTION bricklab.commerce_admin_ledger(text),bricklab.commerce_confirm_receipt_correction(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.commerce_admin_ledger(text),bricklab.commerce_confirm_receipt_correction(uuid,text) TO bricklab_app;
