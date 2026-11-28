-- Partial returns require the reviewed tax documents, not automatic mail
-- of a potentially superseded original receipt. Delivery of any replacement
-- must be verified by the operator as part of partial review.
CREATE OR REPLACE FUNCTION bricklab.commerce_claim_receipt_deliveries()
 RETURNS TABLE(id uuid,order_number bigint,title text,amount_kopecks integer,email text,receipt_url text)
 LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 WITH due AS (SELECT o.id FROM bricklab.commerce_orders o WHERE o.environment='live' AND NOT o.partial_refund_seen AND o.status='succeeded' AND o.receipt_status='issued' AND o.receipt_delivery_url IS NOT NULL AND o.receipt_delivery_sent_at IS NULL AND o.receipt_delivery_next_at<=now()
 ORDER BY o.receipt_delivery_next_at,o.id LIMIT 5 FOR UPDATE SKIP LOCKED),
 claimed AS (UPDATE bricklab.commerce_orders o SET receipt_delivery_next_at=now()+interval '5 minutes' FROM due WHERE o.id=due.id RETURNING o.*)
 SELECT c.id,c.order_number,c.title,c.amount_kopecks,u.email::text,c.receipt_delivery_url FROM claimed c JOIN bricklab.users u ON u.id=c.user_id WHERE u.email_verified_at IS NOT NULL
 $$;

DROP FUNCTION bricklab.commerce_admin_health(text);
CREATE FUNCTION bricklab.commerce_admin_health(p_environment text)
 RETURNS TABLE(pending bigint,unattached_old bigint,refund_pending bigint,refund_unattached bigint,receipt_pending bigint,receipt_unknown bigint,early_refund bigint,correction_pending bigint,mail_pending bigint,telegram_pending bigint,partial_review bigint)
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
 count(*) FILTER(WHERE o.status='succeeded' AND NOT o.partial_refund_seen AND o.receipt_delivery_url IS NOT NULL AND o.receipt_delivery_sent_at IS NULL),
 (SELECT count(*) FROM bricklab.commerce_events e JOIN bricklab.commerce_orders x ON x.id=e.order_id WHERE x.environment=p_environment AND e.sent_at IS NULL),
 count(*) FILTER(WHERE o.partial_review_pending)
 FROM bricklab.commerce_orders o WHERE o.environment=p_environment;
 END $$;
REVOKE ALL ON FUNCTION bricklab.commerce_admin_health(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.commerce_admin_health(text) TO bricklab_app;
