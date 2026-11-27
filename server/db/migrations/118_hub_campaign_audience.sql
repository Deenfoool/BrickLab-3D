-- Audience is snapshotted at confirmation, with consent and membership rechecked at claim.
ALTER TABLE bricklab.hub_campaigns ADD COLUMN audience text NOT NULL DEFAULT 'all' CHECK(audience IN ('all','plus','free','new'));
CREATE FUNCTION bricklab.hub_campaign_matches(p_uid uuid,p_audience text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 SELECT CASE p_audience WHEN 'all' THEN true WHEN 'plus' THEN bricklab.hub_plus_end(p_uid) IS NOT NULL
 WHEN 'free' THEN bricklab.hub_plus_end(p_uid) IS NULL
 WHEN 'new' THEN EXISTS(SELECT 1 FROM bricklab.users WHERE id=p_uid AND created_at>=now()-interval '7 days')
 ELSE false END
$$;
REVOKE ALL ON FUNCTION bricklab.hub_campaign_matches(uuid,text) FROM PUBLIC,bricklab_app;
CREATE FUNCTION bricklab.hub_campaign_create(p_body text,p_send_at timestamptz,p_audience text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
DECLARE uid uuid:=nullif(current_setting('bricklab.user_id',true),'')::uuid; result uuid;
BEGIN
 IF NOT coalesce(bricklab.is_admin(),false) OR p_body IS NULL OR length(btrim(p_body)) NOT BETWEEN 1 AND 2500 OR p_send_at IS NULL OR p_send_at>now()+interval '30 days' OR p_audience IS NULL OR p_audience NOT IN ('all','plus','free','new') THEN RETURN NULL; END IF;
 INSERT INTO bricklab.hub_campaigns(body,created_by,send_at,audience) VALUES(btrim(p_body),uid,greatest(p_send_at,now()),p_audience) RETURNING id INTO result;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION bricklab.hub_campaign_list() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
BEGIN
 IF NOT coalesce(bricklab.is_admin(),false) THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('eligible',(SELECT count(*)::int FROM bricklab.telegram_links l JOIN bricklab.users u ON u.id=l.user_id WHERE l.marketing AND u.blocked_at IS NULL AND u.email_verified_at IS NOT NULL),
 'audiences',(SELECT jsonb_object_agg(a,n) FROM (SELECT a,count(l.user_id)::int n FROM unnest(ARRAY['all','plus','free','new']) a
 LEFT JOIN (SELECT l.user_id FROM bricklab.telegram_links l JOIN bricklab.users u ON u.id=l.user_id WHERE l.marketing AND u.blocked_at IS NULL AND u.email_verified_at IS NOT NULL) l ON bricklab.hub_campaign_matches(l.user_id,a) GROUP BY a) totals),
 'items',(SELECT coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) FROM (SELECT p.id,p.body,p.send_at AS "sendAt",p.status,p.audience,
 (SELECT count(*)::int FROM bricklab.hub_campaign_delivery d WHERE d.campaign_id=p.id) AS total,
 (SELECT count(*)::int FROM bricklab.hub_campaign_delivery d WHERE d.campaign_id=p.id AND d.state='sent') AS sent,
 (SELECT count(*)::int FROM bricklab.hub_campaign_delivery d WHERE d.campaign_id=p.id AND d.state IN ('pending','sending')) AS pending,
 (SELECT count(*)::int FROM bricklab.hub_campaign_delivery d WHERE d.campaign_id=p.id AND d.state IN ('failed','skipped','unknown')) AS unsuccessful
 FROM bricklab.hub_campaigns p ORDER BY p.created_at DESC LIMIT 20) c));
END $$;
CREATE OR REPLACE FUNCTION bricklab.hub_campaign_queue(p_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
DECLARE selected text;
BEGIN
 IF NOT coalesce(bricklab.is_admin(),false) THEN RETURN false; END IF;
 UPDATE bricklab.hub_campaigns SET status='queued' WHERE id=p_id AND status='draft' RETURNING audience INTO selected;
 IF NOT FOUND THEN RETURN false; END IF;
 INSERT INTO bricklab.hub_campaign_delivery(campaign_id,user_id,telegram_id)
 SELECT p_id,l.user_id,l.telegram_id FROM bricklab.telegram_links l JOIN bricklab.users u ON u.id=l.user_id
 WHERE l.marketing AND u.blocked_at IS NULL AND u.email_verified_at IS NOT NULL AND bricklab.hub_campaign_matches(l.user_id,selected);
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION bricklab.hub_campaign_claim() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
DECLARE item bricklab.hub_campaign_delivery%ROWTYPE; text_body text;
BEGIN
 IF NOT coalesce(bricklab.is_admin(),false) THEN RETURN NULL; END IF;
 UPDATE bricklab.hub_campaign_delivery SET state='unknown',updated_at=now() WHERE state='sending' AND updated_at<now()-interval '5 minutes';
 UPDATE bricklab.hub_campaign_delivery d SET state='skipped',updated_at=now() WHERE d.state='pending' AND
 NOT EXISTS(SELECT 1 FROM bricklab.telegram_links l JOIN bricklab.users u ON u.id=l.user_id JOIN bricklab.hub_campaigns c ON c.id=d.campaign_id
 WHERE l.user_id=d.user_id AND l.telegram_id=d.telegram_id AND l.marketing AND u.blocked_at IS NULL AND u.email_verified_at IS NOT NULL AND c.status='queued' AND bricklab.hub_campaign_matches(l.user_id,c.audience));
 SELECT d.* INTO item FROM bricklab.hub_campaign_delivery d JOIN bricklab.hub_campaigns c ON c.id=d.campaign_id
 WHERE d.state='pending' AND d.next_at<=now() AND c.status='queued' AND c.send_at<=now()
 ORDER BY c.send_at,d.campaign_id,d.user_id LIMIT 1 FOR UPDATE OF d SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE bricklab.hub_campaign_delivery SET state='sending',attempt=gen_random_uuid(),updated_at=now() WHERE campaign_id=item.campaign_id AND user_id=item.user_id RETURNING * INTO item;
 SELECT body INTO text_body FROM bricklab.hub_campaigns WHERE id=item.campaign_id;
 RETURN jsonb_build_object('attempt',item.attempt,'chatId',item.telegram_id::text,'body',text_body);
END $$;
CREATE OR REPLACE FUNCTION bricklab.hub_campaign_finish(p_attempt uuid,p_result text,p_retry integer) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
BEGIN
 IF NOT coalesce(bricklab.is_admin(),false) OR p_result IS NULL OR p_result NOT IN ('sent','failed','unknown','retry') THEN RETURN false; END IF;
 UPDATE bricklab.hub_campaign_delivery d SET state=CASE WHEN p_result='retry' AND c.status='canceled' THEN 'skipped' WHEN p_result='retry' THEN 'pending' ELSE p_result END,
 next_at=now()+make_interval(secs=>greatest(5,least(coalesce(p_retry,60),3600))),updated_at=now()
 FROM bricklab.hub_campaigns c WHERE c.id=d.campaign_id AND d.attempt=p_attempt AND d.state='sending';
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION bricklab.hub_campaign_create(text,timestamptz,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.hub_campaign_create(text,timestamptz,text) TO bricklab_app;

-- Opt-out takes effect even if the user opts in again before the worker next runs.
CREATE OR REPLACE FUNCTION bricklab.telegram_marketing(p_enabled boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
DECLARE uid uuid:=nullif(current_setting('bricklab.user_id',true),'')::uuid;
BEGIN
 IF p_enabled IS NULL THEN RETURN false; END IF;
 UPDATE bricklab.telegram_links SET marketing=p_enabled WHERE user_id=uid;
 IF NOT FOUND THEN RETURN false; END IF;
 IF NOT p_enabled THEN
  UPDATE bricklab.hub_campaign_delivery SET state='skipped',updated_at=now() WHERE user_id=uid AND state='pending';
 END IF;
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION bricklab.hub_personal_preferences(p_push boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
DECLARE uid uuid:=nullif(current_setting('bricklab.user_id',true),'')::uuid;
BEGIN
 IF p_push IS NULL THEN RETURN false; END IF;
 UPDATE bricklab.telegram_links SET personal_push=p_push WHERE user_id=uid;
 IF NOT FOUND THEN RETURN false; END IF;
 IF NOT p_push THEN
  UPDATE bricklab.hub_personal_events SET state='skipped',updated_at=now() WHERE user_id=uid AND state='pending';
 END IF;
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION bricklab.telegram_unlink() RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
DECLARE uid uuid:=nullif(current_setting('bricklab.user_id',true),'')::uuid;
BEGIN
 IF uid IS NULL THEN RETURN false; END IF;
 DELETE FROM bricklab.telegram_pairing WHERE user_id=uid;
 DELETE FROM bricklab.telegram_links WHERE user_id=uid;
 UPDATE bricklab.hub_campaign_delivery SET state='skipped',updated_at=now() WHERE user_id=uid AND state='pending';
 UPDATE bricklab.hub_personal_events SET state='skipped',updated_at=now() WHERE user_id=uid AND state='pending';
 RETURN true;
END $$;
