-- Preserve remaining paid and promotional Plus periods after an earlier
-- subscription is refunded. Keep consumed intervals and independent products.
-- The caller holds the same owner advisory lock as fulfillment and promo redemption.
CREATE FUNCTION bricklab.commerce_compact_future_plus(p_uid uuid,p_environment text)
 RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,bricklab AS $$
 DECLARE anchor timestamptz; slot record; ending timestamptz;
 BEGIN
 SELECT greatest(now(),coalesce(max(t.expires_at),now())) INTO anchor FROM (
 SELECT g.expires_at FROM bricklab.commerce_grants g JOIN bricklab.commerce_orders o ON o.id=g.order_id AND o.user_id=g.user_id
 WHERE g.user_id=p_uid AND o.environment=p_environment AND o.status='succeeded' AND g.kind='subscription' AND g.revoked_at IS NULL AND g.granted_at<=now() AND g.expires_at>now()
 UNION ALL
 SELECT g.expires_at FROM bricklab.hub_promo_grants g WHERE p_environment='live' AND g.user_id=p_uid AND g.granted_at<=now() AND g.expires_at>now()
 ) t;
 FOR slot IN
 SELECT * FROM (
 SELECT g.id,g.granted_at,g.expires_at,false AS promo,split_part(g.sku,'-',2)::integer AS months
 FROM bricklab.commerce_grants g JOIN bricklab.commerce_orders o ON o.id=g.order_id AND o.user_id=g.user_id
 WHERE g.user_id=p_uid AND o.environment=p_environment AND o.status='succeeded' AND g.kind='subscription' AND g.revoked_at IS NULL AND g.granted_at>now()
 UNION ALL
 SELECT g.id,g.granted_at,g.expires_at,true AS promo,0 AS months FROM bricklab.hub_promo_grants g
 WHERE p_environment='live' AND g.user_id=p_uid AND g.granted_at>now()
 ) periods ORDER BY granted_at,id
 LOOP
  IF slot.granted_at>anchor THEN
   ending:=CASE WHEN slot.promo THEN anchor+(slot.expires_at-slot.granted_at) ELSE anchor+make_interval(months=>slot.months) END;
   IF slot.promo THEN
    UPDATE bricklab.hub_promo_grants SET granted_at=anchor,expires_at=ending WHERE id=slot.id;
   ELSE
    UPDATE bricklab.commerce_grants SET granted_at=anchor,expires_at=ending WHERE id=slot.id;
   END IF;
   anchor:=ending;
  ELSE
   anchor:=greatest(anchor,slot.expires_at);
  END IF;
 END LOOP;
 END $$;
REVOKE ALL ON FUNCTION bricklab.commerce_compact_future_plus(uuid,text) FROM PUBLIC,bricklab_app;
CREATE OR REPLACE FUNCTION bricklab.commerce_refund_full(p_payment text,p_environment text,p_amount integer) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 DECLARE o bricklab.commerce_orders%ROWTYPE; uid uuid; compact boolean;
 BEGIN
 IF p_environment IS NULL OR p_environment NOT IN ('test','live') THEN RETURN false; END IF;
 SELECT user_id INTO uid FROM bricklab.commerce_orders WHERE payment_id=p_payment AND environment=p_environment AND provider='yookassa';
 IF uid IS NULL THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,312042));
 SELECT * INTO o FROM bricklab.commerce_orders WHERE payment_id=p_payment AND environment=p_environment FOR UPDATE;
 IF o.amount_kopecks<>p_amount OR o.provider<>'yookassa' THEN RETURN false; END IF;
 IF o.status='refunded' THEN RETURN true; END IF;
 IF o.status<>'succeeded' THEN RETURN false; END IF;
 SELECT EXISTS(SELECT 1 FROM bricklab.commerce_grants g WHERE g.order_id=o.id AND g.kind='subscription' AND g.revoked_at IS NULL AND g.expires_at>now()) INTO compact;
 UPDATE bricklab.commerce_grants SET revoked_at=greatest(now(),granted_at) WHERE order_id=o.id AND revoked_at IS NULL;
 UPDATE bricklab.commerce_orders SET status='refunded',refunded_at=now(),receipt_correction_pending=(o.environment='live') WHERE id=o.id;
 IF compact THEN PERFORM bricklab.commerce_compact_future_plus(uid,p_environment); END IF;
 RETURN true;
 END $$;
