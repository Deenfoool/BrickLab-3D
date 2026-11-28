-- Store the actual provider-reported amount after processing fees and VAT,
-- not a fixed tariff estimate. NULL is unknown, never zero.
ALTER TABLE bricklab.commerce_orders ADD COLUMN provider_income_kopecks integer
 CHECK(provider_income_kopecks IS NULL OR provider_income_kopecks BETWEEN 0 AND amount_kopecks);
CREATE FUNCTION bricklab.commerce_settle_verified_income(p_order uuid,p_payment text,p_environment text,p_amount integer,p_refunded boolean,p_income integer)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 BEGIN
 IF p_environment IS DISTINCT FROM 'live' OR p_income IS NULL OR p_amount IS NULL OR p_income<0 OR p_income>p_amount THEN RETURN false; END IF;
 IF NOT bricklab.commerce_settle_verified(p_order,p_payment,p_environment,p_amount,p_refunded) THEN RETURN false; END IF;
 UPDATE bricklab.commerce_orders SET provider_income_kopecks=p_income WHERE id=p_order AND environment='live' AND payment_id=p_payment;
 RETURN FOUND;
 END $$;
REVOKE ALL ON FUNCTION bricklab.commerce_settle_verified_income(uuid,text,text,integer,boolean,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.commerce_settle_verified_income(uuid,text,text,integer,boolean,integer) TO bricklab_app;
CREATE FUNCTION bricklab.commerce_admin_provider_totals(p_environment text)
 RETURNS TABLE(day text,paid_count bigint,known_count bigint,unknown_count bigint,gross_kopecks bigint,known_gross_kopecks bigint,provider_income_kopecks bigint,fees_kopecks bigint,refunded_kopecks bigint,net_after_provider_kopecks bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 BEGIN
 IF NOT bricklab.is_admin() THEN RAISE EXCEPTION 'admin_required'; END IF;
 IF p_environment IS DISTINCT FROM 'live' THEN RAISE EXCEPTION 'invalid_environment'; END IF;
 RETURN QUERY WITH bounds AS (
 SELECT date_trunc('day',now() AT TIME ZONE 'Europe/Moscow') AS local_day
 ), span AS (
 SELECT local_day,local_day AT TIME ZONE 'Europe/Moscow' AS lo,(local_day+interval '1 day') AT TIME ZONE 'Europe/Moscow' AS hi FROM bounds
 ), p AS (
 SELECT count(*) AS n,count(o.provider_income_kopecks) AS known,
 coalesce(sum(o.amount_kopecks),0)::bigint AS gross,
 coalesce(sum(o.amount_kopecks) FILTER(WHERE o.provider_income_kopecks IS NOT NULL),0)::bigint AS known_gross,
 coalesce(sum(o.provider_income_kopecks),0)::bigint AS income
 FROM bricklab.commerce_orders o,span s WHERE o.environment='live' AND o.paid_at>=s.lo AND o.paid_at<s.hi
 ), r AS (
 SELECT coalesce(sum(o.amount_kopecks),0)::bigint AS total FROM bricklab.commerce_orders o,span s WHERE o.environment='live' AND o.refunded_at>=s.lo AND o.refunded_at<s.hi
 )
 SELECT to_char(s.local_day,'YYYY-MM-DD'),p.n,p.known,p.n-p.known,p.gross,p.known_gross,p.income,p.known_gross-p.income,r.total,
 CASE WHEN p.n=p.known THEN p.income-r.total ELSE NULL END FROM span s,p,r;
 END $$;
REVOKE ALL ON FUNCTION bricklab.commerce_admin_provider_totals(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.commerce_admin_provider_totals(text) TO bricklab_app;
DROP FUNCTION bricklab.commerce_admin_ledger(text);


CREATE FUNCTION bricklab.commerce_admin_ledger(p_environment text)
 RETURNS TABLE(id uuid,user_id uuid,display_name text,email text,sku text,title text,amount_kopecks integer,status text,receipt_status text,receipt_reference text,created_at timestamptz,paid_at timestamptz,refund_requested_at timestamptz,provider_refund_id text,receipt_correction_pending boolean,receipt_correction_reference text,order_number bigint,receipt_delivery_url text,receipt_delivery_sent_at timestamptz,fiscal_state text,fiscal_next_at timestamptz,payment_id text,provider_income_kopecks integer)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 BEGIN
 IF NOT bricklab.is_admin() THEN RAISE EXCEPTION 'admin_required'; END IF;
 IF p_environment IS NULL OR p_environment NOT IN ('test','live') THEN RAISE EXCEPTION 'invalid_environment'; END IF;
 RETURN QUERY SELECT o.id,o.user_id,coalesce(nullif(p.display_name,''),u.display_name)::text,u.email::text,o.sku,o.title,o.amount_kopecks,o.status,o.receipt_status,o.receipt_reference,o.created_at,o.paid_at,o.refund_requested_at,o.provider_refund_id,o.receipt_correction_pending,o.receipt_correction_reference,o.order_number,o.receipt_delivery_url,o.receipt_delivery_sent_at,o.fiscal_state,o.fiscal_next_at,o.payment_id,o.provider_income_kopecks
 FROM bricklab.commerce_orders o JOIN bricklab.users u ON u.id=o.user_id LEFT JOIN bricklab.profiles p ON p.user_id=o.user_id
 WHERE o.environment=p_environment ORDER BY (o.environment='live' AND (o.receipt_correction_pending OR (o.status='succeeded' AND (o.receipt_status='pending' OR (o.receipt_delivery_url IS NOT NULL AND o.receipt_delivery_sent_at IS NULL))))) DESC,o.created_at DESC LIMIT 100;
 END $$;
REVOKE ALL ON FUNCTION bricklab.commerce_admin_ledger(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.commerce_admin_ledger(text) TO bricklab_app;

