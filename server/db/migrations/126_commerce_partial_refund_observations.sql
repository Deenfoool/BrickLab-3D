-- Partial returns are observed from verified provider GETs, never initiated
-- by this application. Keep cumulative amounts monotonic, with one journal
-- entry per newly observed increment. Timestamps are observation time.
ALTER TABLE bricklab.commerce_orders
 ADD COLUMN refunded_kopecks integer NOT NULL DEFAULT 0 CHECK(refunded_kopecks BETWEEN 0 AND amount_kopecks),
 ADD COLUMN partial_refund_seen boolean NOT NULL DEFAULT false,
 ADD COLUMN partial_review_pending boolean NOT NULL DEFAULT false;
UPDATE bricklab.commerce_orders SET refunded_kopecks=amount_kopecks WHERE status='refunded';
CREATE TABLE bricklab.commerce_refund_observations (
 order_id uuid NOT NULL REFERENCES bricklab.commerce_orders(id) ON DELETE RESTRICT,
 cumulative_kopecks integer NOT NULL CHECK(cumulative_kopecks>0),
 delta_kopecks integer NOT NULL CHECK(delta_kopecks>0 AND delta_kopecks<=cumulative_kopecks),
 observed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(order_id,cumulative_kopecks)
);
INSERT INTO bricklab.commerce_refund_observations(order_id,cumulative_kopecks,delta_kopecks,observed_at)
 SELECT id,amount_kopecks,amount_kopecks,refunded_at FROM bricklab.commerce_orders WHERE status='refunded';
CREATE INDEX commerce_refund_observations_time ON bricklab.commerce_refund_observations(observed_at);
REVOKE ALL ON bricklab.commerce_refund_observations FROM PUBLIC,bricklab_app;
CREATE FUNCTION bricklab.commerce_guard_refund_observation() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog,bricklab AS $$
 BEGIN
 IF NEW.status='refunded' THEN NEW.refunded_kopecks:=NEW.amount_kopecks; END IF;
 IF NEW.refunded_kopecks<OLD.refunded_kopecks THEN RAISE EXCEPTION 'refund_observation_regressed'; END IF;
 IF NEW.refunded_kopecks>OLD.refunded_kopecks AND NEW.refunded_kopecks<NEW.amount_kopecks THEN NEW.partial_refund_seen:=true; END IF;
 IF NEW.environment='live' AND NEW.partial_refund_seen AND NEW.refunded_kopecks>OLD.refunded_kopecks THEN NEW.partial_review_pending:=true; END IF;
 RETURN NEW;
 END $$;
CREATE TRIGGER commerce_guard_refund_observation BEFORE UPDATE ON bricklab.commerce_orders FOR EACH ROW EXECUTE FUNCTION bricklab.commerce_guard_refund_observation();
CREATE FUNCTION bricklab.commerce_record_refund_observation() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog,bricklab AS $$
 BEGIN
 IF NEW.refunded_kopecks>OLD.refunded_kopecks THEN
 INSERT INTO bricklab.commerce_refund_observations(order_id,cumulative_kopecks,delta_kopecks)
 VALUES(NEW.id,NEW.refunded_kopecks,NEW.refunded_kopecks-OLD.refunded_kopecks);
 END IF;
 RETURN NEW;
 END $$;
CREATE TRIGGER commerce_record_refund_observation AFTER UPDATE ON bricklab.commerce_orders FOR EACH ROW EXECUTE FUNCTION bricklab.commerce_record_refund_observation();
REVOKE ALL ON FUNCTION bricklab.commerce_guard_refund_observation(),bricklab.commerce_record_refund_observation() FROM PUBLIC,bricklab_app;

CREATE FUNCTION bricklab.commerce_observe_partial_refund(p_order uuid,p_payment text,p_environment text,p_amount integer,p_refunded integer,p_income integer)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 DECLARE uid uuid; o bricklab.commerce_orders%ROWTYPE;
 BEGIN
 IF p_environment IS NULL OR p_environment NOT IN ('test','live') OR p_amount IS NULL OR p_refunded IS NULL
 OR p_refunded<=0 OR p_refunded>=p_amount OR (p_income IS NOT NULL AND (p_environment<>'live' OR p_income<0 OR p_income>p_amount)) THEN RETURN false; END IF;
 SELECT user_id INTO uid FROM bricklab.commerce_orders WHERE id=p_order;
 IF uid IS NULL THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,312042));
 IF NOT bricklab.commerce_settle_verified(p_order,p_payment,p_environment,p_amount,false) THEN RETURN false; END IF;
 SELECT * INTO o FROM bricklab.commerce_orders WHERE id=p_order FOR UPDATE;
 -- A delayed provider response may show an older cumulative amount.
 IF o.status='refunded' OR p_refunded<=o.refunded_kopecks THEN RETURN true; END IF;
 UPDATE bricklab.commerce_orders SET refunded_kopecks=p_refunded,provider_income_kopecks=coalesce(p_income,provider_income_kopecks) WHERE id=p_order;
 RETURN FOUND;
 END $$;
REVOKE ALL ON FUNCTION bricklab.commerce_observe_partial_refund(uuid,text,text,integer,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.commerce_observe_partial_refund(uuid,text,text,integer,integer,integer) TO bricklab_app;

-- Tax automation must not issue/cancel blindly after a partial return.
-- A previously uncertain issue can still be reconciled read-only.
CREATE OR REPLACE FUNCTION bricklab.commerce_claim_fiscal(p_since timestamptz)
 RETURNS TABLE(id uuid,order_number bigint,title text,amount_kopecks integer,payment_id text,paid_at timestamptz,status text,action text,receipt_uuid text)
 LANGUAGE sql SET search_path=pg_catalog,bricklab AS $$
 WITH candidate AS (
 SELECT o.id,o.fiscal_state AS previous FROM bricklab.commerce_orders o
 WHERE o.environment='live' AND o.provider='yookassa' AND o.offer_version IS NOT NULL AND o.accepted_at IS NOT NULL
 AND o.paid_at>=p_since AND o.fiscal_next_at<=now()
 AND (NOT o.partial_refund_seen OR o.fiscal_state IN ('issue_unknown','cancel_unknown'))
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

-- Full refund correction of a partial-return order is a separate manual
-- procedure. Do not let the ordinary correction button dismiss it.
CREATE FUNCTION bricklab.commerce_admin_partial_review(p_order uuid,p_expected integer,p_reference text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 DECLARE uid uuid;
 BEGIN
 uid:=nullif(current_setting('bricklab.user_id',true),'')::uuid;
 IF uid IS NULL OR NOT bricklab.is_admin() THEN RAISE EXCEPTION 'admin_required'; END IF;
 IF p_reference IS NULL OR length(trim(p_reference)) NOT BETWEEN 1 AND 250 OR p_expected IS NULL THEN RETURN false; END IF;
 UPDATE bricklab.commerce_orders o SET partial_review_pending=false,
 receipt_correction_pending=false,receipt_correction_reference=trim(p_reference),receipt_corrected_at=now(),receipt_corrected_by=uid
 WHERE o.id=p_order AND o.environment='live' AND o.partial_review_pending AND o.refunded_kopecks=p_expected
 AND o.fiscal_state NOT IN ('issue_unknown','cancel_unknown') AND o.receipt_status='issued';
 RETURN FOUND;
 END $$;
REVOKE ALL ON FUNCTION bricklab.commerce_admin_partial_review(uuid,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.commerce_admin_partial_review(uuid,integer,text) TO bricklab_app;

CREATE OR REPLACE FUNCTION bricklab.commerce_day_totals(p_environment text)
 RETURNS TABLE(day text,paid_kopecks bigint,refunded_kopecks bigint,paid_count bigint,refund_count bigint)
 LANGUAGE sql STABLE SET search_path=pg_catalog,bricklab AS $$
 WITH bounds AS (SELECT date_trunc('day',now() AT TIME ZONE 'Europe/Moscow') AS start_local),
 t AS (SELECT start_local,start_local AT TIME ZONE 'Europe/Moscow' AS lo,(start_local+interval '1 day') AT TIME ZONE 'Europe/Moscow' AS hi FROM bounds),
 p AS (SELECT coalesce(sum(o.amount_kopecks),0)::bigint AS total,count(*) AS n FROM bricklab.commerce_orders o,t WHERE o.environment=p_environment AND o.paid_at>=t.lo AND o.paid_at<t.hi),
 r AS (SELECT coalesce(sum(r.delta_kopecks),0)::bigint AS total,count(*) AS n FROM bricklab.commerce_refund_observations r JOIN bricklab.commerce_orders o ON o.id=r.order_id CROSS JOIN t WHERE o.environment=p_environment AND r.observed_at>=t.lo AND r.observed_at<t.hi)
 SELECT to_char(t.start_local,'YYYY-MM-DD'),p.total,r.total,p.n,r.n FROM t,p,r
 $$;

CREATE OR REPLACE FUNCTION bricklab.commerce_admin_provider_totals(p_environment text)
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
 SELECT coalesce(sum(r.delta_kopecks),0)::bigint AS total FROM bricklab.commerce_refund_observations r JOIN bricklab.commerce_orders o ON o.id=r.order_id CROSS JOIN span s WHERE o.environment='live' AND r.observed_at>=s.lo AND r.observed_at<s.hi
 )
 SELECT to_char(s.local_day,'YYYY-MM-DD'),p.n,p.known,p.n-p.known,p.gross,p.known_gross,p.income,p.known_gross-p.income,r.total,
 CASE WHEN p.n=p.known THEN p.income-r.total ELSE NULL END FROM span s,p,r;
 END $$;
REVOKE ALL ON FUNCTION bricklab.commerce_admin_provider_totals(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.commerce_admin_provider_totals(text) TO bricklab_app;

DROP FUNCTION bricklab.commerce_admin_ledger(text);



CREATE FUNCTION bricklab.commerce_admin_ledger(p_environment text)
 RETURNS TABLE(id uuid,user_id uuid,display_name text,email text,sku text,title text,amount_kopecks integer,status text,receipt_status text,receipt_reference text,created_at timestamptz,paid_at timestamptz,refund_requested_at timestamptz,provider_refund_id text,receipt_correction_pending boolean,receipt_correction_reference text,order_number bigint,receipt_delivery_url text,receipt_delivery_sent_at timestamptz,fiscal_state text,fiscal_next_at timestamptz,payment_id text,provider_income_kopecks integer,refunded_kopecks integer,partial_refund_seen boolean,partial_review_pending boolean)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 BEGIN
 IF NOT bricklab.is_admin() THEN RAISE EXCEPTION 'admin_required'; END IF;
 IF p_environment IS NULL OR p_environment NOT IN ('test','live') THEN RAISE EXCEPTION 'invalid_environment'; END IF;
 RETURN QUERY SELECT o.id,o.user_id,coalesce(nullif(p.display_name,''),u.display_name)::text,u.email::text,o.sku,o.title,o.amount_kopecks,o.status,o.receipt_status,o.receipt_reference,o.created_at,o.paid_at,o.refund_requested_at,o.provider_refund_id,o.receipt_correction_pending,o.receipt_correction_reference,o.order_number,o.receipt_delivery_url,o.receipt_delivery_sent_at,o.fiscal_state,o.fiscal_next_at,o.payment_id,o.provider_income_kopecks,o.refunded_kopecks,o.partial_refund_seen,o.partial_review_pending
 FROM bricklab.commerce_orders o JOIN bricklab.users u ON u.id=o.user_id LEFT JOIN bricklab.profiles p ON p.user_id=o.user_id
 WHERE o.environment=p_environment ORDER BY (o.environment='live' AND (o.partial_review_pending OR o.receipt_correction_pending OR (o.status='succeeded' AND (o.receipt_status='pending' OR (o.receipt_delivery_url IS NOT NULL AND o.receipt_delivery_sent_at IS NULL))))) DESC,o.created_at DESC LIMIT 100;
 END $$;
REVOKE ALL ON FUNCTION bricklab.commerce_admin_ledger(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.commerce_admin_ledger(text) TO bricklab_app;

