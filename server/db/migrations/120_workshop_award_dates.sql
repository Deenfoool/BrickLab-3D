-- Only selected earned awards on a publicly visible showcase expose their dates.
CREATE OR REPLACE FUNCTION bricklab.public_achievement_details(p_public uuid) RETURNS jsonb
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 SELECT jsonb_build_object('xp',coalesce((SELECT sum((d.definition->>'xp')::integer) FROM bricklab.workshop_awards w JOIN bricklab.achievement_definitions d ON d.id=w.award WHERE w.user_id=p.user_id),0),
 'style',(SELECT style FROM bricklab.achievement_appearance a WHERE a.user_id=p.user_id),
 'dates',coalesce((SELECT jsonb_object_agg(w.award,w.awarded_at) FROM bricklab.workshop_awards w WHERE w.user_id=p.user_id AND w.award=ANY(bricklab.public_achievement_showcase(p.public_id))),'{}'::jsonb),
 'definitions',coalesce((SELECT jsonb_agg(d.definition) FROM bricklab.achievement_definitions d WHERE d.id LIKE 'custom-%' AND d.id=ANY(bricklab.public_achievement_showcase(p.public_id))),'[]'::jsonb))
 FROM bricklab.public_profiles p JOIN bricklab.users u ON u.id=p.user_id WHERE (p.visible OR p.user_id=nullif(current_setting('bricklab.user_id',true),'')::uuid) AND p.public_id=p_public AND p.unified AND p.portfolio->'blocks' @> '[{"key":"awards","visible":true}]'::jsonb AND u.blocked_at IS NULL
 $$;

