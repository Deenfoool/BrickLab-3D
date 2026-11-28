-- Append-only operator journal. No raw request, email, receipt URL or provider secret.
CREATE TABLE bricklab.commerce_admin_audit (
 request_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN ('refund','reconcile','register_receipt','confirm_receipt','receipt_correction','partial_review','finance_export')),
 environment text NOT NULL CHECK(environment IN ('test','live')),
 order_id uuid,
 phase text NOT NULL CHECK(phase IN ('started','succeeded','failed')),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(request_id,phase)
);
CREATE UNIQUE INDEX commerce_admin_audit_terminal ON bricklab.commerce_admin_audit(request_id) WHERE phase<>'started';
CREATE INDEX commerce_admin_audit_recent ON bricklab.commerce_admin_audit(environment,recorded_at DESC);
REVOKE ALL ON bricklab.commerce_admin_audit FROM PUBLIC,bricklab_app;
CREATE FUNCTION bricklab.commerce_admin_audit_write(p_request uuid,p_action text,p_environment text,p_order uuid,p_phase text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 DECLARE uid uuid:=nullif(current_setting('bricklab.user_id',true),'')::uuid;
 BEGIN
 IF uid IS NULL OR NOT bricklab.is_admin() THEN RAISE EXCEPTION 'admin_required'; END IF;
 IF (p_action='finance_export') IS DISTINCT FROM (p_order IS NULL) THEN RAISE EXCEPTION 'invalid_audit'; END IF;
 IF p_phase<>'started' AND NOT EXISTS(SELECT 1 FROM bricklab.commerce_admin_audit a WHERE a.request_id=p_request AND a.actor_id=uid AND a.action=p_action AND a.environment=p_environment AND a.order_id IS NOT DISTINCT FROM p_order AND a.phase='started') THEN RAISE EXCEPTION 'invalid_audit'; END IF;
 INSERT INTO bricklab.commerce_admin_audit(request_id,actor_id,action,environment,order_id,phase) VALUES(p_request,uid,p_action,p_environment,p_order,p_phase);
 END $$;
CREATE FUNCTION bricklab.commerce_admin_audit_list(p_environment text)
 RETURNS TABLE(request_id uuid,actor_id uuid,action text,environment text,order_id uuid,phase text,recorded_at timestamptz)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 BEGIN
 IF NOT bricklab.is_admin() THEN RAISE EXCEPTION 'admin_required'; END IF;
 IF p_environment IS NULL OR p_environment NOT IN ('test','live') THEN RAISE EXCEPTION 'invalid_environment'; END IF;
 RETURN QUERY SELECT a.request_id,a.actor_id,a.action,a.environment,a.order_id,a.phase,a.recorded_at FROM bricklab.commerce_admin_audit a WHERE a.environment=p_environment ORDER BY a.recorded_at DESC,a.request_id LIMIT 200;
 END $$;

-- Operations, not an order snapshot. A partial return and a subsequent full
-- return are separate signed deltas; the original payment is included once.
CREATE FUNCTION bricklab.commerce_admin_export(p_environment text,p_from date,p_to date)
 RETURNS TABLE(event_at timestamptz,event_type text,order_id uuid,order_number bigint,sku text,provider text,payment_id text,amount_kopecks integer,provider_income_kopecks integer)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 DECLARE lo timestamptz; hi timestamptz;
 BEGIN
 IF NOT bricklab.is_admin() THEN RAISE EXCEPTION 'admin_required'; END IF;
 IF p_environment IS NULL OR p_environment NOT IN ('test','live') THEN RAISE EXCEPTION 'invalid_environment'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR NOT isfinite(p_from) OR NOT isfinite(p_to) OR p_to-p_from NOT BETWEEN 0 AND 30 THEN RAISE EXCEPTION 'invalid_export_range'; END IF;
 lo:=p_from::timestamp AT TIME ZONE 'Europe/Moscow'; hi:=(p_to+1)::timestamp AT TIME ZONE 'Europe/Moscow';
 RETURN QUERY
 SELECT x.event_at,x.event_type,x.order_id,x.order_number,x.sku,x.provider,x.payment_id,x.amount_kopecks,x.provider_income_kopecks FROM (
 SELECT o.paid_at AS event_at,'payment'::text AS event_type,o.id AS order_id,o.order_number,o.sku::text,o.provider::text,o.payment_id::text,o.amount_kopecks,o.provider_income_kopecks
 FROM bricklab.commerce_orders o WHERE o.environment=p_environment AND o.paid_at>=lo AND o.paid_at<hi
 UNION ALL
 SELECT f.observed_at,'refund_observed'::text,o.id,o.order_number,o.sku::text,o.provider::text,o.payment_id::text,-f.delta_kopecks,NULL::integer
 FROM bricklab.commerce_refund_observations f JOIN bricklab.commerce_orders o ON o.id=f.order_id WHERE o.environment=p_environment AND f.observed_at>=lo AND f.observed_at<hi
 ) x ORDER BY x.event_at,x.order_id,x.event_type,x.amount_kopecks LIMIT 10001;
 END $$;
REVOKE ALL ON FUNCTION bricklab.commerce_admin_audit_write(uuid,text,text,uuid,text),bricklab.commerce_admin_audit_list(text),bricklab.commerce_admin_export(text,date,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.commerce_admin_audit_write(uuid,text,text,uuid,text),bricklab.commerce_admin_audit_list(text),bricklab.commerce_admin_export(text,date,date) TO bricklab_app;

-- The ordinary correction endpoint must not dismiss a partial-return case.
CREATE OR REPLACE FUNCTION bricklab.commerce_confirm_receipt_correction(p_order uuid,p_reference text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 DECLARE uid uuid:=nullif(current_setting('bricklab.user_id',true),'')::uuid;
 BEGIN
 IF uid IS NULL OR NOT bricklab.is_admin() THEN RAISE EXCEPTION 'admin_required'; END IF;
 IF p_reference IS NULL OR length(trim(p_reference)) NOT BETWEEN 1 AND 250 OR p_reference ~ '[[:cntrl:]]' THEN RETURN false; END IF;
 UPDATE bricklab.commerce_orders o SET receipt_correction_pending=false,receipt_correction_reference=trim(p_reference),receipt_corrected_at=now(),receipt_corrected_by=uid
 WHERE o.id=p_order AND o.environment='live' AND o.status='refunded' AND o.receipt_correction_pending AND o.receipt_status='issued'
 AND NOT o.partial_refund_seen AND o.fiscal_state NOT IN ('issue_unknown','cancel_unknown');
 RETURN FOUND;
 END $$;
