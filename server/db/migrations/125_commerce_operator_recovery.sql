-- A single admin-selected order for provider read-only reconciliation.
-- No direct state updates or manual payment confirmation from the browser.
CREATE FUNCTION bricklab.commerce_admin_recovery_order(p_order uuid,p_environment text)
 RETURNS TABLE(id uuid,payment_id text,amount_kopecks integer,status text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 BEGIN
 IF NOT bricklab.is_admin() THEN RAISE EXCEPTION 'admin_required'; END IF;
 IF p_environment IS NULL OR p_environment NOT IN ('test','live') THEN RAISE EXCEPTION 'invalid_environment'; END IF;
 RETURN QUERY SELECT o.id,o.payment_id,o.amount_kopecks,o.status FROM bricklab.commerce_orders o
 WHERE o.id=p_order AND o.environment=p_environment AND o.provider='yookassa';
 END $$;
REVOKE ALL ON FUNCTION bricklab.commerce_admin_recovery_order(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.commerce_admin_recovery_order(uuid,text) TO bricklab_app;
