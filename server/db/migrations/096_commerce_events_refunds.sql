-- Durable payment events, created in the same transaction as order state changes.
CREATE TABLE bricklab.commerce_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 order_id uuid NOT NULL REFERENCES bricklab.commerce_orders(id) ON DELETE CASCADE,
 event text NOT NULL CHECK(event IN ('succeeded','canceled','refunded')),
 created_at timestamptz NOT NULL DEFAULT now(),
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 sent_at timestamptz,
 UNIQUE(order_id,event)
);
REVOKE ALL ON bricklab.commerce_events FROM PUBLIC,bricklab_app;
CREATE FUNCTION bricklab.commerce_record_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 BEGIN
 IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('succeeded','canceled','refunded') THEN
 INSERT INTO bricklab.commerce_events(order_id,event) VALUES(NEW.id,NEW.status) ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
 END $$;
CREATE TRIGGER commerce_record_event AFTER UPDATE OF status ON bricklab.commerce_orders FOR EACH ROW EXECUTE FUNCTION bricklab.commerce_record_event();
-- Include the recent successful sandbox payment used to validate the existing integration.
INSERT INTO bricklab.commerce_events(order_id,event)
 SELECT id,'succeeded' FROM bricklab.commerce_orders WHERE environment='test' AND status='succeeded' AND paid_at>=now()-interval '1 day' ON CONFLICT DO NOTHING;
CREATE FUNCTION bricklab.commerce_claim_events() RETURNS TABLE(id bigint,event text,order_id uuid,user_id uuid,title text,amount_kopecks integer,environment text)
 LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 WITH due AS (SELECT e.id FROM bricklab.commerce_events e WHERE e.sent_at IS NULL AND e.next_attempt_at<=now() ORDER BY e.id LIMIT 5 FOR UPDATE SKIP LOCKED),
 claimed AS (UPDATE bricklab.commerce_events e SET next_attempt_at=now()+interval '5 minutes' FROM due WHERE e.id=due.id RETURNING e.*)
 SELECT c.id,c.event,o.id,o.user_id,o.title,o.amount_kopecks,o.environment FROM claimed c JOIN bricklab.commerce_orders o ON o.id=c.order_id
 $$;
CREATE FUNCTION bricklab.commerce_ack_event(p_id bigint) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 BEGIN UPDATE bricklab.commerce_events SET sent_at=now() WHERE id=p_id AND sent_at IS NULL; RETURN FOUND; END $$;
CREATE FUNCTION bricklab.commerce_refund_full(p_payment text,p_environment text,p_amount integer) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 DECLARE o bricklab.commerce_orders%ROWTYPE; uid uuid;
 BEGIN
 IF p_environment IS DISTINCT FROM 'test' THEN RETURN false; END IF;
 SELECT user_id INTO uid FROM bricklab.commerce_orders WHERE payment_id=p_payment AND environment=p_environment;
 IF uid IS NULL THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,312042));
 SELECT * INTO o FROM bricklab.commerce_orders WHERE payment_id=p_payment AND environment=p_environment FOR UPDATE;
 IF o.amount_kopecks<>p_amount OR o.provider<>'yookassa' THEN RETURN false; END IF;
 IF o.status='refunded' THEN RETURN true; END IF;
 IF o.status<>'succeeded' THEN RETURN false; END IF;
 UPDATE bricklab.commerce_grants SET revoked_at=greatest(now(),granted_at) WHERE order_id=o.id AND revoked_at IS NULL;
 UPDATE bricklab.commerce_orders SET status='refunded',refunded_at=now() WHERE id=o.id;
 RETURN true;
 END $$;
REVOKE ALL ON FUNCTION bricklab.commerce_record_event(),bricklab.commerce_claim_events(),bricklab.commerce_ack_event(bigint),bricklab.commerce_refund_full(text,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.commerce_claim_events(),bricklab.commerce_ack_event(bigint),bricklab.commerce_refund_full(text,text,integer) TO bricklab_app;
