-- Minimal signed-in product analytics, separated from payment accounting.
-- One row per user, set, event and UTC day. No IP, device fingerprint or free text.
CREATE TABLE bricklab.instruction_activity (
 user_id uuid NOT NULL REFERENCES bricklab.users(id) ON DELETE CASCADE,
 day date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
 set_id text NOT NULL CHECK(set_id ~ '^[0-9]{3,7}-[0-9]{1,2}$'),
 event text NOT NULL CHECK(event IN ('set_open','build_start','hint_use','offer_view','checkout_click')),
 PRIMARY KEY(user_id,day,set_id,event)
);
CREATE INDEX instruction_activity_day_idx ON bricklab.instruction_activity(day);
ALTER TABLE bricklab.instruction_activity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON bricklab.instruction_activity FROM PUBLIC,bricklab_app;
CREATE FUNCTION bricklab.record_instruction_activity(p_set text,p_event text) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 DECLARE uid uuid; today date:=(now() AT TIME ZONE 'UTC')::date;
 BEGIN
 uid:=nullif(current_setting('bricklab.user_id',true),'')::uuid;
 IF uid IS NULL OR NOT EXISTS(SELECT 1 FROM bricklab.users WHERE id=uid AND blocked_at IS NULL) THEN RETURN; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,312043));
 IF (SELECT count(*) FROM bricklab.instruction_activity WHERE user_id=uid AND day=today)>=250 THEN RETURN; END IF;
 INSERT INTO bricklab.instruction_activity(user_id,set_id,event) VALUES(uid,p_set,p_event) ON CONFLICT DO NOTHING;
 END; $;
CREATE FUNCTION bricklab.instruction_analytics() RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 DECLARE uid uuid; result jsonb;
 BEGIN
 uid:=nullif(current_setting('bricklab.user_id',true),'')::uuid;
 IF uid IS NULL OR NOT EXISTS(SELECT 1 FROM bricklab.admin_accounts WHERE user_id=uid) THEN RAISE EXCEPTION 'admin_required'; END IF;
 WITH recent AS (SELECT * FROM bricklab.instruction_activity WHERE day>=(now() AT TIME ZONE 'UTC')::date-89),
 events AS (SELECT event,count(*) AS interactions,count(DISTINCT user_id) AS users FROM recent GROUP BY event),
 popular AS (SELECT set_id,count(DISTINCT user_id) AS users FROM recent WHERE event='set_open' GROUP BY set_id ORDER BY users DESC,set_id LIMIT 10),
 paid AS (SELECT * FROM bricklab.commerce_orders WHERE environment='live' AND sku LIKE 'instruction-%' AND status IN ('succeeded','refunded') AND paid_at>=now()-interval '90 days'),
 buyers AS (SELECT user_id,count(*) AS n FROM paid WHERE status='succeeded' GROUP BY user_id)
 SELECT jsonb_build_object(
 'events',coalesce((SELECT jsonb_agg(to_jsonb(events)) FROM events),'[]'::jsonb),
 'popular',coalesce((SELECT jsonb_agg(to_jsonb(popular) ORDER BY users DESC,set_id) FROM popular),'[]'::jsonb),
 'activeUsers',(SELECT count(DISTINCT user_id) FROM recent),
 'welcomeClaims',(SELECT count(*) FROM bricklab.instruction_welcome_grants WHERE granted_at>=now()-interval '90 days'),
 'firstBuilders',(SELECT count(*) FROM bricklab.instruction_first_build WHERE earned_at>=now()-interval '90 days'),
 'paidOrders',(SELECT count(*) FROM paid WHERE status='succeeded'),
 'buyers',(SELECT count(*) FROM buyers),
 'repeatBuyers',(SELECT count(*) FROM buyers WHERE n>1),
 'refundedOrders',(SELECT count(*) FROM paid WHERE status='refunded'),
 'netKopecks',coalesce((SELECT sum(amount_kopecks) FROM paid WHERE status='succeeded'),0)
 ) INTO result;
 RETURN result;
 END; $;
REVOKE ALL ON FUNCTION bricklab.record_instruction_activity(text,text),bricklab.instruction_analytics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.record_instruction_activity(text,text),bricklab.instruction_analytics() TO bricklab_app;
