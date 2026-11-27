-- User-controlled metric arrangement. Only IDs may be persisted.
CREATE FUNCTION bricklab.valid_workshop_metric_layout(p jsonb) RETURNS boolean
 LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT CASE WHEN jsonb_typeof(p)='array' THEN
   jsonb_array_length(p)<=10 AND
   NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p) e(value) WHERE jsonb_typeof(value)<>'string' OR value#>>'{}' NOT IN ('likes','builds','followers','xp','title','rank','published','downloads','level','achievements')) AND
   (SELECT count(DISTINCT value) FROM jsonb_array_elements(p) e(value))=jsonb_array_length(p)
 ELSE false END
 $$;
ALTER TABLE bricklab.profiles ADD COLUMN metric_layout jsonb NOT NULL DEFAULT '["likes","builds","followers","xp","title","rank"]'::jsonb CHECK(bricklab.valid_workshop_metric_layout(metric_layout));
GRANT UPDATE(metric_layout) ON bricklab.profiles TO bricklab_app;
-- One ranking source for the paginated list and exact profile placement.
CREATE VIEW bricklab.achievement_ranked_profiles AS
 WITH scores AS (SELECT w.user_id,sum((d.definition->>'xp')::integer)::int xp,count(*)::int awards FROM bricklab.workshop_awards w JOIN bricklab.achievement_definitions d ON d.id=w.award GROUP BY w.user_id)
 SELECT p.public_id,p.display_name,coalesce(s.xp,0) score,coalesce(s.awards,0) awards,rank() OVER(ORDER BY coalesce(s.xp,0) DESC)::int place
 FROM bricklab.public_profiles p JOIN bricklab.users u ON u.id=p.user_id LEFT JOIN scores s ON s.user_id=p.user_id
 WHERE p.unified AND p.portfolio->'blocks' @> '[{"key":"awards","visible":true}]'::jsonb AND u.blocked_at IS NULL;
REVOKE ALL ON bricklab.achievement_ranked_profiles FROM PUBLIC,bricklab_app;
CREATE OR REPLACE FUNCTION bricklab.achievement_rankings(p_offset integer) RETURNS TABLE(id uuid,"displayName" text,xp integer,"position" integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 SELECT public_id,display_name,score,place FROM bricklab.achievement_ranked_profiles ORDER BY score DESC,public_id LIMIT 51 OFFSET greatest(0,least(p_offset,10000))
 $$;
CREATE FUNCTION bricklab.public_workshop_summary(p_public uuid) RETURNS jsonb
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 SELECT jsonb_build_object('layout',pr.metric_layout,'rank',r.place,'awards',r.awards)
 FROM bricklab.public_profiles p JOIN bricklab.users u ON u.id=p.user_id LEFT JOIN bricklab.profiles pr ON pr.user_id=p.user_id
 LEFT JOIN bricklab.achievement_ranked_profiles r ON r.public_id=p.public_id
 WHERE p.public_id=p_public AND u.blocked_at IS NULL
 $$;
REVOKE ALL ON FUNCTION bricklab.public_workshop_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.public_workshop_summary(uuid) TO bricklab_app;
