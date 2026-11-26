-- Stable human-readable order numbers and accurate daily totals for each mode.
ALTER TABLE bricklab.commerce_orders ADD COLUMN order_number bigint GENERATED ALWAYS AS IDENTITY;
ALTER TABLE bricklab.commerce_orders ADD CONSTRAINT commerce_order_number_unique UNIQUE(order_number);
CREATE INDEX commerce_paid_daily ON bricklab.commerce_orders(environment,paid_at) WHERE paid_at IS NOT NULL;
CREATE INDEX commerce_refunded_daily ON bricklab.commerce_orders(environment,refunded_at) WHERE refunded_at IS NOT NULL;
CREATE FUNCTION bricklab.commerce_day_totals(p_environment text)
 RETURNS TABLE(day text,paid_kopecks bigint,refunded_kopecks bigint,paid_count bigint,refund_count bigint)
 LANGUAGE sql STABLE SET search_path=pg_catalog,bricklab AS $$
 WITH bounds AS (SELECT date_trunc('day',now() AT TIME ZONE 'Europe/Moscow') AS start_local),
 t AS (SELECT start_local,start_local AT TIME ZONE 'Europe/Moscow' AS lo,(start_local+interval '1 day') AT TIME ZONE 'Europe/Moscow' AS hi FROM bounds),
 p AS (SELECT coalesce(sum(o.amount_kopecks),0)::bigint AS total,count(*) AS n FROM bricklab.commerce_orders o,t WHERE o.environment=p_environment AND o.paid_at>=t.lo AND o.paid_at<t.hi),
 r AS (SELECT coalesce(sum(o.amount_kopecks),0)::bigint AS total,count(*) AS n FROM bricklab.commerce_orders o,t WHERE o.environment=p_environment AND o.refunded_at>=t.lo AND o.refunded_at<t.hi)
 SELECT to_char(t.start_local,'YYYY-MM-DD'),p.total,r.total,p.n,r.n FROM t,p,r
 $$;
REVOKE ALL ON FUNCTION bricklab.commerce_day_totals(text) FROM PUBLIC,bricklab_app;
CREATE FUNCTION bricklab.commerce_admin_day_totals(p_environment text)
 RETURNS TABLE(day text,paid_kopecks bigint,refunded_kopecks bigint,paid_count bigint,refund_count bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 BEGIN
 IF NOT bricklab.is_admin() THEN RAISE EXCEPTION 'admin_required'; END IF;
 IF p_environment IS NULL OR p_environment NOT IN ('test','live') THEN RAISE EXCEPTION 'invalid_environment'; END IF;
 RETURN QUERY SELECT * FROM bricklab.commerce_day_totals(p_environment);
 END $$;
DROP FUNCTION bricklab.commerce_claim_events();
CREATE FUNCTION bricklab.commerce_claim_events()
 RETURNS TABLE(id bigint,event text,order_id uuid,user_id uuid,title text,amount_kopecks integer,environment text,order_number bigint,buyer_name text,occurred_at timestamptz,day text,paid_kopecks bigint,refunded_kopecks bigint,paid_count bigint,refund_count bigint,receipt_status text,receipt_correction_pending boolean)
 LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 WITH due AS (SELECT e.id FROM bricklab.commerce_events e WHERE e.sent_at IS NULL AND e.next_attempt_at<=now() ORDER BY e.id LIMIT 5 FOR UPDATE SKIP LOCKED),
 claimed AS (UPDATE bricklab.commerce_events e SET next_attempt_at=now()+interval '5 minutes' FROM due WHERE e.id=due.id RETURNING e.*)
 SELECT c.id,c.event,o.id,o.user_id,o.title,o.amount_kopecks,o.environment,o.order_number,
 coalesce(nullif(p.display_name,''),u.display_name)::text,c.created_at,t.day,t.paid_kopecks,t.refunded_kopecks,t.paid_count,t.refund_count,o.receipt_status,o.receipt_correction_pending
 FROM claimed c JOIN bricklab.commerce_orders o ON o.id=c.order_id JOIN bricklab.users u ON u.id=o.user_id LEFT JOIN bricklab.profiles p ON p.user_id=o.user_id
 CROSS JOIN LATERAL bricklab.commerce_day_totals(o.environment) t ORDER BY c.id
 $$;
REVOKE ALL ON FUNCTION bricklab.commerce_claim_events(),bricklab.commerce_admin_day_totals(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.commerce_claim_events(),bricklab.commerce_admin_day_totals(text) TO bricklab_app;
