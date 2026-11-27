-- Personal events are independent of promotional consent. Push is opt-in.
ALTER TABLE bricklab.telegram_links ADD COLUMN personal_push boolean NOT NULL DEFAULT false;
CREATE TABLE bricklab.hub_personal_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES bricklab.users(id) ON DELETE CASCADE,
 telegram_id bigint NOT NULL,
 event_key text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('award','follow','comment','likes','rank','plus')),
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 1000),
 created_at timestamptz NOT NULL DEFAULT now(),
 state text NOT NULL CHECK(state IN ('pending','sending','sent','failed','skipped','unknown')),
 attempt uuid,
 updated_at timestamptz NOT NULL DEFAULT now(),
 next_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,event_key)
);
CREATE INDEX hub_personal_pending ON bricklab.hub_personal_events(next_at) WHERE state='pending';
CREATE INDEX hub_personal_inbox ON bricklab.hub_personal_events(user_id,created_at DESC);
CREATE TABLE bricklab.hub_personal_baseline(
 user_id uuid PRIMARY KEY REFERENCES bricklab.telegram_links(user_id) ON DELETE CASCADE,
 likes integer NOT NULL,
 rank integer
);
REVOKE ALL ON bricklab.hub_personal_events,bricklab.hub_personal_baseline FROM PUBLIC,bricklab_app;
CREATE FUNCTION bricklab.hub_add_event(p_uid uuid,p_key text,p_kind text,p_body text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 INSERT INTO bricklab.hub_personal_events(user_id,telegram_id,event_key,kind,body,state)
 SELECT l.user_id,l.telegram_id,p_key,p_kind,p_body,CASE WHEN l.personal_push THEN 'pending' ELSE 'skipped' END
 FROM bricklab.telegram_links l JOIN bricklab.users u ON u.id=l.user_id
 WHERE l.user_id=p_uid AND u.blocked_at IS NULL AND u.email_verified_at IS NOT NULL
 ON CONFLICT(user_id,event_key) DO NOTHING
$$;
CREATE FUNCTION bricklab.hub_social_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
DECLARE recipient uuid; label text;
BEGIN
 IF TG_TABLE_NAME='workshop_awards' THEN
  SELECT definition->>'ru' INTO label FROM bricklab.achievement_definitions WHERE id=NEW.award;
  PERFORM bricklab.hub_add_event(NEW.user_id,'award:'||NEW.award,'award','Новое достижение: '||left(coalesce(label,NEW.award),200));
 ELSIF TG_TABLE_NAME='community_follows' THEN
  SELECT user_id INTO recipient FROM bricklab.public_profiles WHERE public_id=NEW.author_id;
  IF recipient<>NEW.user_id THEN
   PERFORM bricklab.hub_add_event(recipient,'follow:'||NEW.user_id,'follow','У твоей мастерской новый подписчик!');
  END IF;
 ELSIF TG_TABLE_NAME='community_comments' THEN
  SELECT p.user_id,b.title INTO recipient,label FROM bricklab.public_builds b JOIN bricklab.public_profiles p ON p.public_id=b.author_id WHERE b.public_id=NEW.build_id;
  IF NEW.body IS NOT NULL AND NOT EXISTS(SELECT 1 FROM bricklab.public_profiles WHERE public_id=NEW.author_id AND user_id=recipient) THEN
   -- Limit repeated comment notifications from the same author/build to one per UTC day.
   PERFORM bricklab.hub_add_event(recipient,'comment:'||NEW.build_id||':'||NEW.author_id||':'||(now() AT TIME ZONE 'UTC')::date,'comment','Новый комментарий к сборке «'||left(coalesce(label,'BrickLab'),200)||'».');
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER hub_award_event AFTER INSERT ON bricklab.workshop_awards FOR EACH ROW EXECUTE FUNCTION bricklab.hub_social_event();
CREATE TRIGGER hub_follow_event AFTER INSERT ON bricklab.community_follows FOR EACH ROW EXECUTE FUNCTION bricklab.hub_social_event();
CREATE TRIGGER hub_comment_event AFTER INSERT ON bricklab.community_comments FOR EACH ROW EXECUTE FUNCTION bricklab.hub_social_event();
-- Merge overlapping or adjacent paid and promotional periods; do not extend a gap.
CREATE FUNCTION bricklab.hub_plus_end(p_uid uuid) RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 SELECT upper(r) FROM (
 SELECT unnest(range_agg(tstzrange(a,b,'[)'))) AS r FROM (
 SELECT g.granted_at a,g.expires_at b FROM bricklab.commerce_grants g JOIN bricklab.commerce_orders o ON o.id=g.order_id AND o.user_id=g.user_id
 WHERE g.user_id=p_uid AND g.kind='subscription' AND g.revoked_at IS NULL AND o.environment='live' AND o.status='succeeded'
 UNION ALL SELECT granted_at,expires_at FROM bricklab.hub_promo_grants WHERE user_id=p_uid
 ) spans
 ) merged WHERE r @> now()
$$;
CREATE FUNCTION bricklab.hub_prepare_personal() RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
DECLARE p record; prev bricklab.hub_personal_baseline%ROWTYPE; threshold integer; ending timestamptz;
BEGIN
 IF NOT coalesce(bricklab.is_admin(),false) THEN RETURN false; END IF;
 IF NOT pg_try_advisory_xact_lock(810031,117) THEN RETURN true; END IF;
 FOR p IN SELECT l.user_id,coalesce(c.likes,0)::int likes,r.place AS rank
 FROM bricklab.telegram_links l JOIN bricklab.users u ON u.id=l.user_id
 LEFT JOIN bricklab.public_profiles pr ON pr.user_id=l.user_id
 LEFT JOIN bricklab.community_reputation c ON c.author_id=pr.public_id
 LEFT JOIN bricklab.achievement_ranked_profiles r ON r.public_id=pr.public_id
 WHERE u.blocked_at IS NULL AND u.email_verified_at IS NOT NULL
 LOOP
  SELECT * INTO prev FROM bricklab.hub_personal_baseline WHERE user_id=p.user_id;
  IF FOUND THEN
   SELECT max(n) INTO threshold FROM unnest(ARRAY[10,50,100,500,1000,5000,10000]) n WHERE n>prev.likes AND n<=p.likes;
   IF threshold IS NOT NULL THEN
    PERFORM bricklab.hub_add_event(p.user_id,'likes:'||threshold,'likes','Твои сборки получили уже '||threshold||' лайков!');
    -- Mark smaller crossed levels as consumed without generating a burst of messages.
    INSERT INTO bricklab.hub_personal_events(user_id,telegram_id,event_key,kind,body,state)
    SELECT l.user_id,l.telegram_id,'likes:'||n,'likes','Пройден рубеж '||n||' лайков.','skipped'
    FROM bricklab.telegram_links l CROSS JOIN unnest(ARRAY[10,50,100,500,1000,5000,10000]) n
    WHERE l.user_id=p.user_id AND n>prev.likes AND n<threshold ON CONFLICT DO NOTHING;
   END IF;
   IF p.rank IS NOT NULL AND prev.rank IS NOT NULL THEN
    SELECT min(n) INTO threshold FROM unnest(ARRAY[3,10,100]) n WHERE p.rank<=n AND prev.rank>n;
    IF threshold IS NOT NULL THEN
     PERFORM bricklab.hub_add_event(p.user_id,'rank:'||threshold,'rank','Ты в топ-'||threshold||' конструкторов BrickLab!');
    END IF;
   END IF;
  END IF;
  INSERT INTO bricklab.hub_personal_baseline(user_id,likes,rank) VALUES(p.user_id,p.likes,p.rank)
  ON CONFLICT(user_id) DO UPDATE SET likes=greatest(bricklab.hub_personal_baseline.likes,excluded.likes),rank=excluded.rank;
  ending:=bricklab.hub_plus_end(p.user_id);
  IF ending IS NOT NULL AND ending<=now()+interval '7 days' THEN
   threshold:=CASE WHEN ending<=now()+interval '1 day' THEN 1 ELSE 7 END;
   PERFORM bricklab.hub_add_event(p.user_id,'plus:'||extract(epoch FROM ending)::bigint||':'||threshold,'plus',
   CASE WHEN threshold=1 THEN 'BrickLab Plus закончится в течение суток.' ELSE 'До окончания BrickLab Plus осталось не более 7 дней.' END);
  END IF;
 END LOOP;
 RETURN true;
END $$;
CREATE FUNCTION bricklab.hub_personal_preferences(p_push boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
BEGIN
 IF p_push IS NULL THEN RETURN false; END IF;
 UPDATE bricklab.telegram_links SET personal_push=p_push WHERE user_id=nullif(current_setting('bricklab.user_id',true),'')::uuid;
 RETURN FOUND;
END $$;
CREATE FUNCTION bricklab.hub_personal_claim() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
DECLARE item bricklab.hub_personal_events%ROWTYPE;
BEGIN
 IF NOT coalesce(bricklab.is_admin(),false) THEN RETURN NULL; END IF;
 UPDATE bricklab.hub_personal_events SET state='unknown',updated_at=now() WHERE state='sending' AND updated_at<now()-interval '5 minutes';
 UPDATE bricklab.hub_personal_events e SET state='skipped',updated_at=now() WHERE state='pending' AND
 (created_at<now()-interval '2 days' OR NOT EXISTS(SELECT 1 FROM bricklab.telegram_links l JOIN bricklab.users u ON u.id=l.user_id WHERE l.user_id=e.user_id AND l.telegram_id=e.telegram_id AND l.personal_push AND l.linked_at<=e.created_at AND u.blocked_at IS NULL AND u.email_verified_at IS NOT NULL));
 SELECT * INTO item FROM bricklab.hub_personal_events WHERE state='pending' AND next_at<=now() ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE bricklab.hub_personal_events SET state='sending',attempt=gen_random_uuid(),updated_at=now() WHERE id=item.id RETURNING * INTO item;
 RETURN jsonb_build_object('attempt',item.attempt,'chatId',item.telegram_id::text,'body',item.body,'personal',true);
END $$;
CREATE FUNCTION bricklab.hub_personal_finish(p_attempt uuid,p_result text,p_retry integer) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
BEGIN
 IF NOT coalesce(bricklab.is_admin(),false) OR p_result IS NULL OR p_result NOT IN ('sent','failed','unknown','retry') THEN RETURN false; END IF;
 UPDATE bricklab.hub_personal_events SET state=CASE WHEN p_result='retry' THEN 'pending' ELSE p_result END,
 next_at=now()+make_interval(secs=>greatest(5,least(coalesce(p_retry,60),3600))),updated_at=now() WHERE attempt=p_attempt AND state='sending';
 RETURN FOUND;
END $$;
CREATE FUNCTION bricklab.hub_personal_inbox() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) FROM (
 SELECT e.id,e.kind,e.body,e.created_at AS "sentAt" FROM bricklab.hub_personal_events e
 JOIN bricklab.telegram_links l ON l.user_id=e.user_id AND l.telegram_id=e.telegram_id
 WHERE e.user_id=nullif(current_setting('bricklab.user_id',true),'')::uuid AND e.created_at>=l.linked_at
 ORDER BY e.created_at DESC LIMIT 50) x
$$;
CREATE OR REPLACE FUNCTION bricklab.telegram_link_status() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 SELECT jsonb_build_object('linked',EXISTS(SELECT 1 FROM bricklab.telegram_links WHERE user_id=nullif(current_setting('bricklab.user_id',true),'')::uuid),
 'marketing',coalesce((SELECT marketing FROM bricklab.telegram_links WHERE user_id=nullif(current_setting('bricklab.user_id',true),'')::uuid),false),
 'personalPush',coalesce((SELECT personal_push FROM bricklab.telegram_links WHERE user_id=nullif(current_setting('bricklab.user_id',true),'')::uuid),false))
$$;
REVOKE ALL ON FUNCTION bricklab.hub_add_event(uuid,text,text,text),bricklab.hub_social_event(),bricklab.hub_plus_end(uuid) FROM PUBLIC,bricklab_app;
REVOKE ALL ON FUNCTION bricklab.hub_prepare_personal(),bricklab.hub_personal_preferences(boolean),bricklab.hub_personal_claim(),bricklab.hub_personal_finish(uuid,text,integer),bricklab.hub_personal_inbox() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.hub_prepare_personal(),bricklab.hub_personal_preferences(boolean),bricklab.hub_personal_claim(),bricklab.hub_personal_finish(uuid,text,integer),bricklab.hub_personal_inbox() TO bricklab_app;
