-- Reserve a bounded batch of attached pending test payments for provider polling.
-- No HTTP route exposes this cross-account queue; no new payment is created.
ALTER TABLE bricklab.commerce_orders ADD COLUMN next_payment_check_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX commerce_pending_payment_check ON bricklab.commerce_orders(next_payment_check_at,id)
 WHERE environment='test' AND provider='yookassa' AND status='pending' AND payment_id IS NOT NULL;
CREATE FUNCTION bricklab.commerce_claim_test_payments()
 RETURNS TABLE(id uuid,payment_id text,amount_kopecks integer)
 LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 WITH due AS (
  SELECT o.id FROM bricklab.commerce_orders o
   WHERE o.environment='test' AND o.provider='yookassa' AND o.status='pending'
   AND o.payment_id IS NOT NULL AND o.next_payment_check_at<=now()
   ORDER BY o.next_payment_check_at,o.id LIMIT 5 FOR UPDATE SKIP LOCKED
 )
 UPDATE bricklab.commerce_orders o SET next_payment_check_at=now()+interval '5 minutes'
 FROM due WHERE o.id=due.id RETURNING o.id,o.payment_id,o.amount_kopecks
 $$;
REVOKE ALL ON FUNCTION bricklab.commerce_claim_test_payments() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.commerce_claim_test_payments() TO bricklab_app;
