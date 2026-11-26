-- Tax automation is deliberately not started by the web application.
-- Only the trusted local VPS operator can claim or complete fiscal operations.
-- "unknown" is recorded BEFORE making an external write; a retry only reads FNS.
ALTER TABLE bricklab.commerce_orders
 ADD COLUMN fiscal_state text NOT NULL DEFAULT 'idle' CHECK(fiscal_state IN ('idle','issue_unknown','issued','cancel_unknown','canceled')),
 ADD COLUMN fiscal_next_at timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN fiscal_receipt_uuid text CHECK(fiscal_receipt_uuid IS NULL OR fiscal_receipt_uuid ~ '^[A-Za-z0-9_-]{1,80}$'),
 ADD COLUMN fiscal_operation_at timestamptz;
CREATE UNIQUE INDEX commerce_fiscal_uuid ON bricklab.commerce_orders(fiscal_receipt_uuid) WHERE fiscal_receipt_uuid IS NOT NULL;
CREATE FUNCTION bricklab.commerce_claim_fiscal(p_since timestamptz)
 RETURNS TABLE(id uuid,order_number bigint,title text,amount_kopecks integer,payment_id text,paid_at timestamptz,status text,action text,receipt_uuid text)
 LANGUAGE sql SET search_path=pg_catalog,bricklab AS $$
 WITH candidate AS (
 SELECT o.id,o.fiscal_state AS previous FROM bricklab.commerce_orders o
 WHERE o.environment='live' AND o.provider='yookassa' AND o.offer_version IS NOT NULL AND o.accepted_at IS NOT NULL
 AND o.paid_at>=p_since AND o.fiscal_next_at<=now()
 AND (
 (o.status='succeeded' AND o.receipt_status='pending' AND o.fiscal_state='idle')
 OR (o.status IN ('succeeded','refunded') AND o.fiscal_state='issue_unknown')
 OR (o.status='refunded' AND o.receipt_correction_pending AND o.fiscal_state IN ('issued','cancel_unknown'))
 )
 ORDER BY o.fiscal_next_at,o.paid_at,o.id LIMIT 1 FOR UPDATE SKIP LOCKED
 ), claimed AS (
 UPDATE bricklab.commerce_orders o SET fiscal_next_at=now()+interval '5 minutes',
 fiscal_state=CASE WHEN c.previous='idle' THEN 'issue_unknown' WHEN c.previous='issued' THEN 'cancel_unknown' ELSE c.previous END
 FROM candidate c WHERE o.id=c.id
 RETURNING o.*,c.previous
 )
 SELECT c.id,c.order_number,c.title,c.amount_kopecks,c.payment_id,c.paid_at,c.status,
 CASE c.previous WHEN 'idle' THEN 'issue' WHEN 'issue_unknown' THEN 'reconcile_issue' WHEN 'issued' THEN 'cancel' ELSE 'reconcile_cancel' END,c.fiscal_receipt_uuid FROM claimed c
 $$;
CREATE FUNCTION bricklab.commerce_fiscal_finish(p_order uuid,p_action text,p_uuid text,p_url text,p_at timestamptz)
 RETURNS boolean LANGUAGE plpgsql SET search_path=pg_catalog,bricklab AS $$
 BEGIN
 IF p_action='issue' THEN
  IF p_uuid IS NULL OR p_uuid !~ '^[A-Za-z0-9_-]{1,80}$' OR p_url IS NULL
    OR p_url !~ '^https://lknpd\.nalog\.ru/api/v1/receipt/[0-9]{12}/[A-Za-z0-9_-]{1,80}/print$'
    OR split_part(p_url,'/',8)<>p_uuid OR p_at IS NULL THEN RETURN false; END IF;
  UPDATE bricklab.commerce_orders o SET fiscal_state='issued',fiscal_receipt_uuid=p_uuid,fiscal_operation_at=p_at,
    fiscal_next_at=now(),receipt_status='issued',receipt_reference=p_url,receipt_confirmed_at=now(),receipt_delivery_url=p_url,receipt_delivery_next_at=now()
  WHERE o.id=p_order AND o.environment='live' AND o.status IN ('succeeded','refunded') AND o.fiscal_state='issue_unknown' AND o.receipt_status='pending';
 ELSIF p_action='cancel' THEN
  UPDATE bricklab.commerce_orders o SET fiscal_state='canceled',fiscal_next_at=now(),receipt_correction_pending=false,
    receipt_correction_reference='ФНС: аннулирован чек '||p_uuid,receipt_corrected_at=now()
  WHERE o.id=p_order AND o.environment='live' AND o.status='refunded' AND o.fiscal_state='cancel_unknown'
    AND o.fiscal_receipt_uuid=p_uuid AND o.receipt_correction_pending;
 ELSE RETURN false; END IF;
 RETURN FOUND;
 END $$;
-- A failure before the fiscal request can safely release the claim. Unknown
-- responses NEVER release it; only read-only reconciliation or operator review.
CREATE FUNCTION bricklab.commerce_fiscal_release(p_order uuid,p_action text)
 RETURNS boolean LANGUAGE plpgsql SET search_path=pg_catalog,bricklab AS $$
 BEGIN
 UPDATE bricklab.commerce_orders o SET fiscal_state=CASE p_action WHEN 'issue' THEN 'idle' ELSE 'issued' END
 WHERE o.id=p_order AND o.environment='live' AND ((p_action='issue' AND o.fiscal_state='issue_unknown') OR (p_action='cancel' AND o.fiscal_state='cancel_unknown'));
 RETURN FOUND;
 END $$;
REVOKE ALL ON FUNCTION bricklab.commerce_claim_fiscal(timestamptz),bricklab.commerce_fiscal_finish(uuid,text,text,text,timestamptz),bricklab.commerce_fiscal_release(uuid,text) FROM PUBLIC,bricklab_app;
-- Prevent manual confirmation racing an in-flight fiscal write. Existing manual
-- functions remain available for idle orders and for issued receipts not yet claimed.
CREATE FUNCTION bricklab.commerce_guard_fiscal_manual() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,bricklab AS $$
 BEGIN
 IF OLD.fiscal_state IN ('issue_unknown','cancel_unknown') AND NEW.fiscal_state=OLD.fiscal_state AND
 ((NEW.receipt_status IS DISTINCT FROM OLD.receipt_status) OR (NEW.receipt_correction_pending IS DISTINCT FROM OLD.receipt_correction_pending AND NEW.receipt_correction_pending=false))
 THEN RAISE EXCEPTION 'fiscal_reconciliation_required'; END IF;
 RETURN NEW;
 END $$;
CREATE TRIGGER commerce_guard_fiscal_manual BEFORE UPDATE ON bricklab.commerce_orders FOR EACH ROW EXECUTE FUNCTION bricklab.commerce_guard_fiscal_manual();
REVOKE ALL ON FUNCTION bricklab.commerce_guard_fiscal_manual() FROM PUBLIC,bricklab_app;
