-- Durable, one-time awards. Existing awards and read markers are preserved.
ALTER TABLE bricklab.workshop_awards DROP CONSTRAINT workshop_awards_award_check;
ALTER TABLE bricklab.workshop_awards ADD CONSTRAINT workshop_awards_award_check CHECK(award IN ('firstCloudSave','firstBrick','parts25','parts100','parts500','parts1000','mega','parts10000','designs10','designs25','designs50','designs100','designs250','models3','models5','models10','models20','days3','days7','days14','days30','days90','days180','firstPublication','pub3','pub5','pub10','pub20','likes1','likes10','likes25','recognition','likes1000','followers1','followers10','followers50','followers100','age30','age90','age180','veteran','age730','founder','academy','instruction','instruction5','instruction10','gears','firstDrive','engine','gearbox','tracks','suspension','belts','bugs','bureau','beta','firstEngineer','worldPioneer','winter'));
DROP POLICY awards_owner_insert ON bricklab.workshop_awards;
CREATE POLICY awards_owner_insert ON bricklab.workshop_awards FOR INSERT TO bricklab_app
 WITH CHECK(award='firstCloudSave' AND user_id=nullif(current_setting('bricklab.user_id',true),'')::uuid
 AND EXISTS(SELECT 1 FROM bricklab.projects WHERE owner_id=user_id));
CREATE TABLE bricklab.achievement_showcases (
 user_id uuid PRIMARY KEY REFERENCES bricklab.users(id) ON DELETE CASCADE,
 awards text[] NOT NULL CHECK(cardinality(awards)<=6)
);
ALTER TABLE bricklab.achievement_showcases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON bricklab.achievement_showcases FROM PUBLIC,bricklab_app;
GRANT SELECT ON bricklab.achievement_showcases TO bricklab_app;
CREATE POLICY achievement_showcase_owner ON bricklab.achievement_showcases FOR SELECT TO bricklab_app
 USING(user_id=nullif(current_setting('bricklab.user_id',true),'')::uuid);
-- Founder cohort is fixed at migration time; never recycled when accounts are removed.
INSERT INTO bricklab.workshop_awards(user_id,award)
 SELECT id,'founder' FROM (SELECT id FROM bricklab.users ORDER BY created_at,id LIMIT 100) early
 ON CONFLICT DO NOTHING;
-- Model size is structural document evidence, NOT proof of physics or authorship.
CREATE FUNCTION bricklab.refresh_achievements() RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 DECLARE uid uuid; m jsonb;
 BEGIN
 uid:=nullif(current_setting('bricklab.user_id',true),'')::uuid;
 IF uid IS NULL OR NOT EXISTS(SELECT 1 FROM bricklab.users WHERE id=uid AND blocked_at IS NULL) THEN RAISE EXCEPTION 'invalid_account'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,312042));
 WITH heads AS (
 SELECT r.document FROM bricklab.projects p JOIN bricklab.project_revisions r ON r.project_id=p.id AND r.revision=p.head_revision WHERE p.owner_id=uid
 ), sizes AS (
 SELECT (SELECT count(DISTINCT v->>'id') FROM jsonb_array_elements(h.document->'parts') v WHERE jsonb_typeof(v->'id')='string' AND length(v->>'id')>0 AND jsonb_typeof(v->'design')='string' AND length(v->>'design')>0) parts,
 (SELECT count(DISTINCT v->>'design') FROM jsonb_array_elements(h.document->'parts') v WHERE jsonb_typeof(v->'id')='string' AND length(v->>'id')>0 AND jsonb_typeof(v->'design')='string' AND length(v->>'design')>0) designs,
 md5((h.document->'parts')::text||(h.document->'connections')::text) fingerprint FROM heads h
 )
 SELECT jsonb_build_object(
 'cloud',CASE WHEN EXISTS(SELECT 1 FROM bricklab.workshop_awards WHERE user_id=uid AND award='firstCloudSave') THEN 1 ELSE 0 END,
 'parts',coalesce(max(parts),0),'designs',coalesce(max(designs),0),'models',count(DISTINCT fingerprint) FILTER(WHERE parts>0),
 'days',(SELECT count(DISTINCT (r.created_at AT TIME ZONE 'UTC')::date) FROM bricklab.project_revisions r JOIN bricklab.projects p ON p.id=r.project_id WHERE p.owner_id=uid AND jsonb_array_length(r.document->'parts')>0),
 'publications',(SELECT count(DISTINCT md5((b.document->'parts')::text||(b.document->'connections')::text)) FROM bricklab.public_builds b JOIN bricklab.public_profiles p ON p.public_id=b.author_id WHERE p.user_id=uid AND b.part_count>0),
 'likes',(SELECT count(DISTINCT l.user_id) FROM bricklab.community_likes l JOIN bricklab.public_builds b ON b.public_id=l.build_id JOIN bricklab.public_profiles p ON p.public_id=b.author_id JOIN bricklab.users u ON u.id=l.user_id WHERE p.user_id=uid AND l.user_id<>uid AND u.email_verified_at IS NOT NULL AND u.blocked_at IS NULL),
 'followers',(SELECT count(*) FROM bricklab.community_follows f JOIN bricklab.public_profiles p ON p.public_id=f.author_id JOIN bricklab.users u ON u.id=f.user_id WHERE p.user_id=uid AND f.user_id<>uid AND u.email_verified_at IS NOT NULL AND u.blocked_at IS NULL),
 'age',(SELECT greatest(0,floor(extract(epoch FROM now()-created_at)/86400))::int FROM bricklab.users WHERE id=uid),
 'founder',CASE WHEN EXISTS(SELECT 1 FROM bricklab.workshop_awards WHERE user_id=uid AND award='founder') THEN 1 ELSE 0 END)
 INTO m FROM sizes;
 INSERT INTO bricklab.workshop_awards(user_id,award)
 SELECT uid,v.award FROM (VALUES
 ('firstBrick','parts',1),
 ('parts25','parts',25),
 ('parts100','parts',100),
 ('parts500','parts',500),
 ('parts1000','parts',1000),
 ('mega','parts',5000),
 ('parts10000','parts',10000),
 ('designs10','designs',10),
 ('designs25','designs',25),
 ('designs50','designs',50),
 ('designs100','designs',100),
 ('designs250','designs',250),
 ('models3','models',3),
 ('models5','models',5),
 ('models10','models',10),
 ('models20','models',20),
 ('days3','days',3),
 ('days7','days',7),
 ('days14','days',14),
 ('days30','days',30),
 ('days90','days',90),
 ('days180','days',180),
 ('firstPublication','publications',1),
 ('pub3','publications',3),
 ('pub5','publications',5),
 ('pub10','publications',10),
 ('pub20','publications',20),
 ('likes1','likes',1),
 ('likes10','likes',10),
 ('likes25','likes',25),
 ('recognition','likes',100),
 ('likes1000','likes',1000),
 ('followers1','followers',1),
 ('followers10','followers',10),
 ('followers50','followers',50),
 ('followers100','followers',100),
 ('age30','age',30),
 ('age90','age',90),
 ('age180','age',180),
 ('veteran','age',365),
 ('age730','age',730)
 ) v(award,metric,target) WHERE coalesce((m->>v.metric)::numeric,0)>=v.target
 ON CONFLICT DO NOTHING;
 RETURN m;
 END; $$;
REVOKE ALL ON FUNCTION bricklab.refresh_achievements() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.refresh_achievements() TO bricklab_app;
CREATE FUNCTION bricklab.set_achievement_showcase(p_awards text[]) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 DECLARE uid uuid;
 BEGIN
 uid:=nullif(current_setting('bricklab.user_id',true),'')::uuid;
 IF uid IS NULL OR p_awards IS NULL OR cardinality(p_awards)>6 OR
 (SELECT count(DISTINCT a) FROM unnest(p_awards) a)<>cardinality(p_awards) OR
 EXISTS(SELECT 1 FROM unnest(p_awards) a WHERE NOT EXISTS(SELECT 1 FROM bricklab.workshop_awards w WHERE w.user_id=uid AND w.award=a))
 THEN RETURN false; END IF;
 INSERT INTO bricklab.achievement_showcases(user_id,awards) VALUES(uid,p_awards)
 ON CONFLICT(user_id) DO UPDATE SET awards=excluded.awards;
 RETURN true;
 END; $$;
REVOKE ALL ON FUNCTION bricklab.set_achievement_showcase(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.set_achievement_showcase(text[]) TO bricklab_app;
CREATE FUNCTION bricklab.public_achievement_showcase(p_public uuid) RETURNS text[]
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 SELECT coalesce(s.awards,CASE WHEN p.show_award THEN ARRAY['firstCloudSave']::text[] ELSE ARRAY[]::text[] END)
 FROM bricklab.public_profiles p LEFT JOIN bricklab.achievement_showcases s ON s.user_id=p.user_id
 WHERE p.public_id=p_public AND p.unified AND p.portfolio->'blocks' @> '[{"key":"awards","visible":true}]'::jsonb
 $$;
REVOKE ALL ON FUNCTION bricklab.public_achievement_showcase(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.public_achievement_showcase(uuid) TO bricklab_app;
CREATE FUNCTION bricklab.achievement_rarity() RETURNS jsonb
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 SELECT coalesce(jsonb_object_agg(award,percent),'{}'::jsonb) FROM (
 SELECT w.award,round(count(*)*100.0/greatest(1,(SELECT count(*) FROM bricklab.users WHERE blocked_at IS NULL)),2) percent
 FROM bricklab.workshop_awards w JOIN bricklab.users u ON u.id=w.user_id WHERE u.blocked_at IS NULL GROUP BY w.award
 ) r
 $$;
REVOKE ALL ON FUNCTION bricklab.achievement_rarity() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.achievement_rarity() TO bricklab_app;
