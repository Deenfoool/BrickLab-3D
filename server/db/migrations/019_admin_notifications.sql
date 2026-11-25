-- Durable administrative notifications. No Telegram credentials or private documents in the queue.
CREATE TABLE bricklab.notification_outbox (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 event_key text NOT NULL UNIQUE CHECK(length(event_key)<=200),
 kind text NOT NULL CHECK(kind IN ('registration','profile','build','build_update','build_report','comment_report','test_paid','test_mismatch','moderation','bug','daily','milestone')),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=4096),
 created_at timestamptz NOT NULL DEFAULT now(),
 next_attempt timestamptz NOT NULL DEFAULT now(),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
 sent_at timestamptz,
 last_error text
);
CREATE INDEX notification_pending ON bricklab.notification_outbox(next_attempt,id) WHERE sent_at IS NULL;
ALTER TABLE bricklab.notification_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON bricklab.notification_outbox FROM PUBLIC,bricklab_app;
CREATE FUNCTION bricklab.enqueue_admin_event(k text,typ text,p jsonb) RETURNS void
 LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 INSERT INTO bricklab.notification_outbox(event_key,kind,payload) VALUES(k,typ,p) ON CONFLICT(event_key) DO NOTHING
$$;
REVOKE ALL ON FUNCTION bricklab.enqueue_admin_event(text,text,jsonb) FROM PUBLIC,bricklab_app;
CREATE FUNCTION bricklab.admin_event_trigger() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE p jsonb; k text; typ text; build uuid;
BEGIN
 CASE TG_TABLE_NAME
 WHEN 'users' THEN
  k:='registration:'||NEW.id;typ:='registration';p:=jsonb_build_object('userId',NEW.id);
 WHEN 'public_profiles' THEN
  k:='profile:'||NEW.public_id;typ:='profile';p:=jsonb_build_object('profileId',NEW.public_id,'name',NEW.display_name);
 WHEN 'public_builds' THEN
  IF TG_OP='UPDATE' THEN
   IF NEW.revision=OLD.revision THEN RETURN NEW; END IF;
   typ:='build_update';
  ELSE typ:='build'; END IF;
  k:='build:'||NEW.public_id||':'||NEW.revision;
  p:=jsonb_build_object('buildId',NEW.public_id,'profileId',NEW.author_id,'title',NEW.title,
   'category',NEW.category,'revision',NEW.revision,'parts',NEW.part_count,'download',NEW.allow_download,'images',cardinality(NEW.images),
   'author',(SELECT display_name FROM bricklab.public_profiles WHERE public_id=NEW.author_id));
 WHEN 'community_build_reports' THEN
  typ:='build_report';k:='build_report:'||NEW.build_id||':'||NEW.reporter_id;
  p:=jsonb_build_object('buildId',NEW.build_id,'reason',NEW.reason);
 WHEN 'community_comment_reports' THEN
  typ:='comment_report';k:='comment_report:'||NEW.comment_id||':'||NEW.reporter_id;
  SELECT build_id INTO build FROM bricklab.community_comments WHERE id=NEW.comment_id;
  p:=jsonb_build_object('buildId',build,'reason',NEW.reason);
 WHEN 'store_test_orders' THEN
  IF NEW.status<>'paid' OR OLD.status='paid' THEN RETURN NEW; END IF;
  typ:='test_paid';k:='test_paid:'||NEW.invoice;p:=jsonb_build_object('invoice',NEW.invoice,'sku',NEW.sku,'kopecks',NEW.amount_kopecks);
 WHEN 'admin_audit' THEN
  typ:='moderation';k:='moderation:'||NEW.id;p:=jsonb_build_object('action',NEW.action);
 ELSE RETURN NEW;
 END CASE;
 PERFORM bricklab.enqueue_admin_event(k,typ,p);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION bricklab.admin_event_trigger() FROM PUBLIC,bricklab_app;
CREATE TRIGGER notify_registration AFTER INSERT ON bricklab.users FOR EACH ROW EXECUTE FUNCTION bricklab.admin_event_trigger();
CREATE TRIGGER notify_profile AFTER INSERT ON bricklab.public_profiles FOR EACH ROW EXECUTE FUNCTION bricklab.admin_event_trigger();
CREATE TRIGGER notify_build AFTER INSERT OR UPDATE OF revision ON bricklab.public_builds FOR EACH ROW EXECUTE FUNCTION bricklab.admin_event_trigger();
CREATE TRIGGER notify_build_report AFTER INSERT ON bricklab.community_build_reports FOR EACH ROW EXECUTE FUNCTION bricklab.admin_event_trigger();
CREATE TRIGGER notify_comment_report AFTER INSERT ON bricklab.community_comment_reports FOR EACH ROW EXECUTE FUNCTION bricklab.admin_event_trigger();
CREATE TRIGGER notify_test_paid AFTER UPDATE OF status ON bricklab.store_test_orders FOR EACH ROW EXECUTE FUNCTION bricklab.admin_event_trigger();
CREATE TRIGGER notify_moderation AFTER INSERT ON bricklab.admin_audit FOR EACH ROW EXECUTE FUNCTION bricklab.admin_event_trigger();

-- Keep test-payment mismatch alerts inside the same verified callback path. Do not alert on unsigned traffic.
CREATE OR REPLACE FUNCTION bricklab.confirm_test_order(number integer, amount integer) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE o bricklab.store_test_orders;
BEGIN
 SELECT * INTO o FROM bricklab.store_test_orders WHERE invoice=number FOR UPDATE;
 IF NOT FOUND OR o.amount_kopecks<>amount THEN
  PERFORM bricklab.enqueue_admin_event('test_mismatch:'||number,'test_mismatch',jsonb_build_object('invoice',number));
  RETURN false;
 END IF;
 IF o.status='paid' THEN RETURN true; END IF;
 UPDATE bricklab.store_test_orders SET status='paid',paid_at=now() WHERE invoice=number;
 INSERT INTO bricklab.store_test_entitlements(user_id,sku,invoice) VALUES(o.user_id,o.sku,o.invoice);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION bricklab.confirm_test_order(integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.confirm_test_order(integer,integer) TO bricklab_app;

-- Explicitly submitted short bug reports; full console, screenshots and contact stay in the user's ZIP.
CREATE TABLE bricklab.operator_bug_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES bricklab.users(id) ON DELETE CASCADE,
 area text NOT NULL CHECK(length(area) BETWEEN 1 AND 100),
 summary text NOT NULL CHECK(length(summary) BETWEEN 1 AND 1500),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE bricklab.operator_bug_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY operator_bug_admin_read ON bricklab.operator_bug_reports FOR SELECT TO bricklab_app USING(bricklab.is_admin());
GRANT SELECT ON bricklab.operator_bug_reports TO bricklab_app;
CREATE FUNCTION bricklab.submit_operator_bug(report_id uuid,area_text text,summary_text text) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE uid uuid:=nullif(current_setting('bricklab.user_id',true),'')::uuid;
BEGIN
 IF uid IS NULL OR NOT EXISTS(SELECT 1 FROM bricklab.users WHERE id=uid AND blocked_at IS NULL) THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,801919));
 IF EXISTS(SELECT 1 FROM bricklab.operator_bug_reports WHERE id=report_id AND user_id=uid) THEN RETURN true; END IF;
 IF (SELECT count(*) FROM bricklab.operator_bug_reports WHERE user_id=uid AND created_at>now()-interval '1 day')>=3 THEN RETURN false; END IF;
 INSERT INTO bricklab.operator_bug_reports(id,user_id,area,summary) VALUES(report_id,uid,area_text,summary_text);
 PERFORM bricklab.enqueue_admin_event('bug:'||report_id,'bug',jsonb_build_object('reportId',report_id));
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION bricklab.submit_operator_bug(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.submit_operator_bug(uuid,text,text) TO bricklab_app;

-- Persistent milestone markers: no historical notification flood when installing.
CREATE TABLE bricklab.notification_milestones (
 target integer PRIMARY KEY, reached_at timestamptz
);
INSERT INTO bricklab.notification_milestones(target,reached_at)
 SELECT target,CASE WHEN target<=(SELECT count(*) FROM bricklab.users) THEN now() ELSE NULL END
 FROM unnest(ARRAY[10,25,50,100,250,500,1000,2500,5000,10000]) target;
REVOKE ALL ON bricklab.notification_milestones FROM PUBLIC,bricklab_app;
CREATE TABLE bricklab.notification_daily_state (day date PRIMARY KEY);
REVOKE ALL ON bricklab.notification_daily_state FROM PUBLIC,bricklab_app;
CREATE FUNCTION bricklab.prepare_notification_digest() RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE total bigint; m record; d date:=(now() AT TIME ZONE 'Europe/Moscow')::date; start_at timestamptz; end_at timestamptz;
BEGIN
 SELECT count(*) INTO total FROM bricklab.users;
 FOR m IN UPDATE bricklab.notification_milestones SET reached_at=now() WHERE reached_at IS NULL AND target<=total RETURNING target LOOP
  PERFORM bricklab.enqueue_admin_event('milestone:'||m.target,'milestone',jsonb_build_object('target',m.target,'total',total));
 END LOOP;
 IF (now() AT TIME ZONE 'Europe/Moscow')::time < time '09:00' THEN RETURN; END IF;
 INSERT INTO bricklab.notification_daily_state(day) VALUES(d) ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN RETURN; END IF;
 start_at:=(d-1)::timestamp AT TIME ZONE 'Europe/Moscow';end_at:=d::timestamp AT TIME ZONE 'Europe/Moscow';
 PERFORM bricklab.enqueue_admin_event('daily:'||d,'daily',jsonb_build_object(
  'day',d-1,'totalUsers',total,
  'newUsers',(SELECT count(*) FROM bricklab.users WHERE created_at>=start_at AND created_at<end_at),
  'verified',(SELECT count(*) FROM bricklab.users WHERE email_verified_at IS NOT NULL),
  'profiles',(SELECT count(*) FROM bricklab.public_profiles),
  'builds',(SELECT count(*) FROM bricklab.public_builds),
  'newBuilds',(SELECT count(*) FROM bricklab.notification_outbox WHERE kind='build' AND created_at>=start_at AND created_at<end_at),
  'comments',(SELECT count(*) FROM bricklab.community_comments WHERE created_at>=start_at AND created_at<end_at),
  'reports',(SELECT count(*) FROM bricklab.community_build_reports WHERE resolved_at IS NULL)+(SELECT count(*) FROM bricklab.community_comment_reports WHERE resolved_at IS NULL),
  'testPaid',(SELECT count(*) FROM bricklab.store_test_orders WHERE paid_at>=start_at AND paid_at<end_at),
  'likes',(SELECT count(*) FROM bricklab.community_likes),
  'downloads',(SELECT count(*) FROM bricklab.community_events WHERE kind='download'),
  'views',(SELECT count(*) FROM bricklab.community_events WHERE kind='view'),
  'follows',(SELECT count(*) FROM bricklab.community_follows)
 ));
END $$;
REVOKE ALL ON FUNCTION bricklab.prepare_notification_digest() FROM PUBLIC,bricklab_app;
