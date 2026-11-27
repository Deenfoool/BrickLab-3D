-- Text-only opt-in campaigns. No Telegram recipient IDs are exposed to the admin UI.
CREATE TABLE bricklab.hub_campaigns(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 2500),
 created_by uuid NOT NULL REFERENCES bricklab.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 send_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','queued','canceled'))
);
CREATE TABLE bricklab.hub_campaign_delivery(
 campaign_id uuid NOT NULL REFERENCES bricklab.hub_campaigns(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES bricklab.users(id) ON DELETE CASCADE,
 telegram_id bigint NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','sent','failed','skipped','unknown')),
 attempt uuid,
 updated_at timestamptz NOT NULL DEFAULT now(),
 next_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(campaign_id,user_id)
);
CREATE INDEX hub_campaign_pending ON bricklab.hub_campaign_delivery(next_at) WHERE state='pending';
REVOKE ALL ON bricklab.hub_campaigns,bricklab.hub_campaign_delivery FROM PUBLIC,bricklab_app;
CREATE FUNCTION bricklab.hub_campaign_create(p_body text,p_send_at timestamptz) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
DECLARE uid uuid:=nullif(current_setting('bricklab.user_id',true),'')::uuid; result uuid;
BEGIN
 IF NOT coalesce(bricklab.is_admin(),false) OR p_body IS NULL OR length(btrim(p_body)) NOT BETWEEN 1 AND 2500 OR p_send_at IS NULL OR p_send_at>now()+interval '30 days' THEN RETURN NULL; END IF;
 INSERT INTO bricklab.hub_campaigns(body,created_by,send_at) VALUES(btrim(p_body),uid,greatest(p_send_at,now())) RETURNING id INTO result;
 RETURN result;
END $$;
CREATE FUNCTION bricklab.hub_campaign_list() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
BEGIN
 IF NOT coalesce(bricklab.is_admin(),false) THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('eligible',(SELECT count(*)::int FROM bricklab.telegram_links l JOIN bricklab.users u ON u.id=l.user_id WHERE l.marketing AND u.blocked_at IS NULL AND u.email_verified_at IS NOT NULL),
 'items',(SELECT coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) FROM (SELECT p.id,p.body,p.send_at AS "sendAt",p.status,
 (SELECT count(*)::int FROM bricklab.hub_campaign_delivery d WHERE d.campaign_id=p.id) AS total,
 (SELECT count(*)::int FROM bricklab.hub_campaign_delivery d WHERE d.campaign_id=p.id AND d.state='sent') AS sent,
 (SELECT count(*)::int FROM bricklab.hub_campaign_delivery d WHERE d.campaign_id=p.id AND d.state IN ('pending','sending')) AS pending,
 (SELECT count(*)::int FROM bricklab.hub_campaign_delivery d WHERE d.campaign_id=p.id AND d.state IN ('failed','skipped','unknown')) AS unsuccessful
 FROM bricklab.hub_campaigns p ORDER BY p.created_at DESC LIMIT 50) c));
END $$;
CREATE FUNCTION bricklab.hub_campaign_queue(p_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
BEGIN
 IF NOT coalesce(bricklab.is_admin(),false) THEN RETURN false; END IF;
 UPDATE bricklab.hub_campaigns SET status='queued' WHERE id=p_id AND status='draft';
 IF NOT FOUND THEN RETURN false; END IF;
 INSERT INTO bricklab.hub_campaign_delivery(campaign_id,user_id,telegram_id)
 SELECT p_id,l.user_id,l.telegram_id FROM bricklab.telegram_links l JOIN bricklab.users u ON u.id=l.user_id
 WHERE l.marketing AND u.blocked_at IS NULL AND u.email_verified_at IS NOT NULL;
 RETURN true;
END $$;
CREATE FUNCTION bricklab.hub_campaign_cancel(p_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
BEGIN
 IF NOT coalesce(bricklab.is_admin(),false) THEN RETURN false; END IF;
 UPDATE bricklab.hub_campaigns SET status='canceled' WHERE id=p_id AND status IN ('draft','queued');
 IF NOT FOUND THEN RETURN false; END IF;
 UPDATE bricklab.hub_campaign_delivery SET state='skipped',updated_at=now() WHERE campaign_id=p_id AND state='pending';
 RETURN true;
END $$;
CREATE FUNCTION bricklab.hub_campaign_claim() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
DECLARE item bricklab.hub_campaign_delivery%ROWTYPE; text_body text;
BEGIN
 IF NOT coalesce(bricklab.is_admin(),false) THEN RETURN NULL; END IF;
 -- A lost response must never repeat an ambiguous Telegram send.
 UPDATE bricklab.hub_campaign_delivery SET state='unknown',updated_at=now() WHERE state='sending' AND updated_at<now()-interval '5 minutes';
 UPDATE bricklab.hub_campaign_delivery d SET state='skipped',updated_at=now() WHERE state='pending' AND
 NOT EXISTS(SELECT 1 FROM bricklab.telegram_links l JOIN bricklab.users u ON u.id=l.user_id WHERE l.user_id=d.user_id AND l.telegram_id=d.telegram_id AND l.marketing AND u.blocked_at IS NULL AND u.email_verified_at IS NOT NULL);
 SELECT d.* INTO item FROM bricklab.hub_campaign_delivery d JOIN bricklab.hub_campaigns c ON c.id=d.campaign_id
 WHERE d.state='pending' AND d.next_at<=now() AND c.status='queued' AND c.send_at<=now()
 ORDER BY c.send_at,d.campaign_id,d.user_id LIMIT 1 FOR UPDATE OF d SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE bricklab.hub_campaign_delivery SET state='sending',attempt=gen_random_uuid(),updated_at=now() WHERE campaign_id=item.campaign_id AND user_id=item.user_id RETURNING * INTO item;
 SELECT body INTO text_body FROM bricklab.hub_campaigns WHERE id=item.campaign_id;
 RETURN jsonb_build_object('attempt',item.attempt,'chatId',item.telegram_id::text,'body',text_body);
END $$;
CREATE FUNCTION bricklab.hub_campaign_finish(p_attempt uuid,p_result text,p_retry integer) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
BEGIN
 IF NOT coalesce(bricklab.is_admin(),false) OR p_result NOT IN ('sent','failed','unknown','retry') THEN RETURN false; END IF;
 UPDATE bricklab.hub_campaign_delivery SET state=CASE WHEN p_result='retry' THEN 'pending' ELSE p_result END,
 next_at=now()+make_interval(secs=>greatest(5,least(coalesce(p_retry,60),3600))),updated_at=now()
 WHERE attempt=p_attempt AND state='sending';
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION bricklab.hub_campaign_create(text,timestamptz),bricklab.hub_campaign_list(),bricklab.hub_campaign_queue(uuid),bricklab.hub_campaign_cancel(uuid),bricklab.hub_campaign_claim(),bricklab.hub_campaign_finish(uuid,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.hub_campaign_create(text,timestamptz),bricklab.hub_campaign_list(),bricklab.hub_campaign_queue(uuid),bricklab.hub_campaign_cancel(uuid),bricklab.hub_campaign_claim(),bricklab.hub_campaign_finish(uuid,text,integer) TO bricklab_app;
