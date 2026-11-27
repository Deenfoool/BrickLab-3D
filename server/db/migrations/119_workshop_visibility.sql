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

CREATE OR REPLACE FUNCTION bricklab.public_achievement_showcase(p_public uuid) RETURNS text[]
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 SELECT coalesce(s.awards,CASE WHEN p.show_award THEN ARRAY['firstCloudSave']::text[] ELSE ARRAY[]::text[] END)
 FROM bricklab.public_profiles p LEFT JOIN bricklab.achievement_showcases s ON s.user_id=p.user_id
 WHERE (p.visible OR p.user_id=nullif(current_setting('bricklab.user_id',true),'')::uuid) AND p.public_id=p_public AND p.unified AND p.portfolio->'blocks' @> '[{"key":"awards","visible":true}]'::jsonb
 $$;

CREATE OR REPLACE FUNCTION bricklab.public_achievement_details(p_public uuid) RETURNS jsonb
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 SELECT jsonb_build_object('xp',coalesce((SELECT sum((d.definition->>'xp')::integer) FROM bricklab.workshop_awards w JOIN bricklab.achievement_definitions d ON d.id=w.award WHERE w.user_id=p.user_id),0),
 'style',(SELECT style FROM bricklab.achievement_appearance a WHERE a.user_id=p.user_id),
 'definitions',coalesce((SELECT jsonb_agg(d.definition) FROM bricklab.achievement_definitions d WHERE d.id LIKE 'custom-%' AND d.id=ANY(bricklab.public_achievement_showcase(p.public_id))),'[]'::jsonb))
 FROM bricklab.public_profiles p JOIN bricklab.users u ON u.id=p.user_id WHERE (p.visible OR p.user_id=nullif(current_setting('bricklab.user_id',true),'')::uuid) AND p.public_id=p_public AND p.unified AND p.portfolio->'blocks' @> '[{"key":"awards","visible":true}]'::jsonb AND u.blocked_at IS NULL
 $$;

-- Browser session can read its own notification preference without exposing Telegram IDs.
CREATE FUNCTION bricklab.workshop_notification_settings() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 SELECT jsonb_build_object('linked',EXISTS(SELECT 1 FROM bricklab.telegram_links WHERE user_id=nullif(current_setting('bricklab.user_id',true),'')::uuid),
 'personalPush',coalesce((SELECT personal_push FROM bricklab.telegram_links WHERE user_id=nullif(current_setting('bricklab.user_id',true),'')::uuid),false))
$$;
REVOKE ALL ON FUNCTION bricklab.workshop_notification_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.workshop_notification_settings() TO bricklab_app;
