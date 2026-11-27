-- Hiding a profile must not delete its publications, reactions or discussions.
ALTER TABLE bricklab.public_profiles ADD COLUMN visible boolean NOT NULL DEFAULT true;
GRANT UPDATE(visible) ON bricklab.public_profiles TO bricklab_app;
ALTER POLICY public_card_read ON bricklab.public_profiles USING(visible OR user_id=nullif(current_setting('bricklab.user_id',true),'')::uuid OR bricklab.is_admin());
ALTER POLICY public_build_read ON bricklab.public_builds USING(EXISTS(SELECT 1 FROM bricklab.public_profiles p WHERE p.public_id=author_id));
ALTER POLICY comments_read ON bricklab.community_comments USING(EXISTS(SELECT 1 FROM bricklab.public_profiles p WHERE p.public_id=author_id) AND EXISTS(SELECT 1 FROM bricklab.public_builds b WHERE b.public_id=build_id));
CREATE OR REPLACE VIEW bricklab.achievement_ranked_profiles AS
 WITH scores AS (SELECT w.user_id,sum((d.definition->>'xp')::integer)::int xp,count(*)::int awards FROM bricklab.workshop_awards w JOIN bricklab.achievement_definitions d ON d.id=w.award GROUP BY w.user_id)
 SELECT p.public_id,p.display_name,coalesce(s.xp,0) score,coalesce(s.awards,0) awards,rank() OVER(ORDER BY coalesce(s.xp,0) DESC)::int place
 FROM bricklab.public_profiles p JOIN bricklab.users u ON u.id=p.user_id LEFT JOIN scores s ON s.user_id=p.user_id
 WHERE p.visible AND p.unified AND p.portfolio->'blocks' @> '[{"key":"awards","visible":true}]'::jsonb AND u.blocked_at IS NULL;

CREATE OR REPLACE FUNCTION bricklab.public_workshop_summary(p_public uuid) RETURNS jsonb
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 SELECT jsonb_build_object('layout',pr.metric_layout,'rank',r.place,'awards',r.awards)
 FROM bricklab.public_profiles p JOIN bricklab.users u ON u.id=p.user_id LEFT JOIN bricklab.profiles pr ON pr.user_id=p.user_id
 LEFT JOIN bricklab.achievement_ranked_profiles r ON r.public_id=p.public_id
 WHERE p.visible AND p.public_id=p_public AND u.blocked_at IS NULL
 $$;

