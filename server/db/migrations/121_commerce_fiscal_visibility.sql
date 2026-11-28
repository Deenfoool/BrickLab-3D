-- Preserve uncertain fiscal writes for read-only reconciliation. A refund
-- before initial issuance requires explicit operator evidence, not a guessed
-- second fiscal write or a false acknowledgement of correction.
CREATE OR REPLACE FUNCTION bricklab.commerce_register_receipt(p_order uuid,p_url text) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 DECLARE uid uuid;
 BEGIN
 uid:=nullif(current_setting('bricklab.user_id',true),'')::uuid;
 IF uid IS NULL OR NOT bricklab.is_admin() THEN RAISE EXCEPTION 'admin_required'; END IF;
 IF p_url IS NULL OR p_url !~ '^https://lknpd\.nalog\.ru/api/v1/receipt/[0-9]{12}/[A-Za-z0-9_-]{1,80}/print$' THEN RETURN false; END IF;
 UPDATE bricklab.commerce_orders o SET receipt_status='issued',receipt_reference=p_url,receipt_confirmed_at=now(),receipt_confirmed_by=uid,
 receipt_delivery_url=p_url,receipt_delivery_next_at=CASE WHEN o.status='succeeded' THEN now() ELSE NULL END
 WHERE o.id=p_order AND o.environment='live' AND o.receipt_status='pending'
 AND (o.status='succeeded' OR (o.status='refunded' AND o.receipt_correction_pending AND o.fiscal_state='idle'));
 RETURN FOUND;
 END $$;
CREATE OR REPLACE FUNCTION bricklab.commerce_confirm_receipt_correction(p_order uuid,p_reference text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 DECLARE uid uuid;
 BEGIN
 uid:=nullif(current_setting('bricklab.user_id',true),'')::uuid;
 IF uid IS NULL OR NOT bricklab.is_admin() THEN RAISE EXCEPTION 'admin_required'; END IF;
 IF p_reference IS NULL OR length(trim(p_reference)) NOT BETWEEN 1 AND 250 THEN RETURN false; END IF;
 UPDATE bricklab.commerce_orders o SET receipt_correction_pending=false,receipt_correction_reference=trim(p_reference),receipt_corrected_at=now(),receipt_corrected_by=uid
 WHERE o.id=p_order AND o.environment='live' AND o.status='refunded' AND o.receipt_correction_pending AND o.receipt_status='issued';
 RETURN FOUND;
 END $$;
DROP FUNCTION bricklab.commerce_admin_ledger(text);

CREATE FUNCTION bricklab.commerce_admin_ledger(p_environment text)
 RETURNS TABLE(id uuid,user_id uuid,display_name text,email text,sku text,title text,amount_kopecks integer,status text,receipt_status text,receipt_reference text,created_at timestamptz,paid_at timestamptz,refund_requested_at timestamptz,provider_refund_id text,receipt_correction_pending boolean,receipt_correction_reference text,order_number bigint,receipt_delivery_url text,receipt_delivery_sent_at timestamptz,fiscal_state text,fiscal_next_at timestamptz,payment_id text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 BEGIN
 IF NOT bricklab.is_admin() THEN RAISE EXCEPTION 'admin_required'; END IF;
 IF p_environment IS NULL OR p_environment NOT IN ('test','live') THEN RAISE EXCEPTION 'invalid_environment'; END IF;
 RETURN QUERY SELECT o.id,o.user_id,coalesce(nullif(p.display_name,''),u.display_name)::text,u.email::text,o.sku,o.title,o.amount_kopecks,o.status,o.receipt_status,o.receipt_reference,o.created_at,o.paid_at,o.refund_requested_at,o.provider_refund_id,o.receipt_correction_pending,o.receipt_correction_reference,o.order_number,o.receipt_delivery_url,o.receipt_delivery_sent_at,o.fiscal_state,o.fiscal_next_at,o.payment_id
 FROM bricklab.commerce_orders o JOIN bricklab.users u ON u.id=o.user_id LEFT JOIN bricklab.profiles p ON p.user_id=o.user_id
 WHERE o.environment=p_environment ORDER BY (o.environment='live' AND (o.receipt_correction_pending OR (o.status='succeeded' AND (o.receipt_status='pending' OR (o.receipt_delivery_url IS NOT NULL AND o.receipt_delivery_sent_at IS NULL))))) DESC,o.created_at DESC LIMIT 100;
 END $$;
REVOKE ALL ON FUNCTION bricklab.commerce_admin_ledger(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.commerce_admin_ledger(text) TO bricklab_app;

-- Full queue counts, independent of the 100 visible ledger rows. No secrets.
CREATE FUNCTION bricklab.commerce_admin_health(p_environment text)
 RETURNS TABLE(pending bigint,unattached_old bigint,refund_pending bigint,refund_unattached bigint,receipt_pending bigint,receipt_unknown bigint,early_refund bigint,correction_pending bigint,mail_pending bigint,telegram_pending bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 BEGIN
 IF NOT bricklab.is_admin() THEN RAISE EXCEPTION 'admin_required'; END IF;
 IF p_environment IS NULL OR p_environment NOT IN ('test','live') THEN RAISE EXCEPTION 'invalid_environment'; END IF;
 RETURN QUERY SELECT
 count(*) FILTER(WHERE o.status='pending'),
 count(*) FILTER(WHERE o.status='pending' AND o.payment_id IS NULL AND o.created_at<now()-interval '23 hours'),
 count(*) FILTER(WHERE o.status='succeeded' AND o.refund_requested_at IS NOT NULL),
 count(*) FILTER(WHERE o.status='succeeded' AND o.refund_requested_at IS NOT NULL AND o.provider_refund_id IS NULL),
 count(*) FILTER(WHERE o.status='succeeded' AND o.receipt_status='pending'),
 count(*) FILTER(WHERE o.fiscal_state IN ('issue_unknown','cancel_unknown')),
 count(*) FILTER(WHERE o.status='refunded' AND o.receipt_status='pending' AND o.receipt_correction_pending AND o.fiscal_state='idle'),
 count(*) FILTER(WHERE o.receipt_correction_pending),
 count(*) FILTER(WHERE o.status='succeeded' AND o.receipt_delivery_url IS NOT NULL AND o.receipt_delivery_sent_at IS NULL),
 (SELECT count(*) FROM bricklab.commerce_events e JOIN bricklab.commerce_orders x ON x.id=e.order_id WHERE x.environment=p_environment AND e.sent_at IS NULL)
 FROM bricklab.commerce_orders o WHERE o.environment=p_environment;
 END $$;
REVOKE ALL ON FUNCTION bricklab.commerce_admin_health(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.commerce_admin_health(text) TO bricklab_app;
