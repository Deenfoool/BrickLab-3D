-- Canonical catalog, including admin-defined immutable achievement rules.
CREATE TABLE bricklab.achievement_definitions (
 id text PRIMARY KEY CHECK(id ~ '^[A-Za-z][A-Za-z0-9-]{0,47}$'),
 definition jsonb NOT NULL CHECK(jsonb_typeof(definition)='object' AND definition->>'id'=id),
 created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO bricklab.achievement_definitions(id,definition) VALUES
('firstCloudSave','{"id":"firstCloudSave","cat":"construction","metric":"cloud","target":1,"xp":30,"rarity":"common","icon":"icon-cloud","ru":"Первая облачная сборка","en":"First cloud build","descRu":"Сохранить первую сборку в облаке.","descEn":"Save your first cloud build."}'::jsonb),
('firstBrick','{"id":"firstBrick","cat":"construction","metric":"parts","target":1,"xp":10,"rarity":"common","icon":"layers","ru":"Первый кирпич","en":"First brick","descRu":"Сохранить модель с 1 деталями с уникальными ID.","descEn":"Save a model with 1 uniquely identified parts."}'::jsonb),
('parts25','{"id":"parts25","cat":"construction","metric":"parts","target":25,"xp":20,"rarity":"common","icon":"layers","ru":"Первые шаги","en":"First steps","descRu":"Сохранить модель с 25 деталями с уникальными ID.","descEn":"Save a model with 25 uniquely identified parts."}'::jsonb),
('parts100','{"id":"parts100","cat":"construction","metric":"parts","target":100,"xp":25,"rarity":"uncommon","icon":"layers","ru":"Подмастерье","en":"Apprentice","descRu":"Сохранить модель с 100 деталями с уникальными ID.","descEn":"Save a model with 100 uniquely identified parts."}'::jsonb),
('parts500','{"id":"parts500","cat":"construction","metric":"parts","target":500,"xp":75,"rarity":"rare","icon":"layers","ru":"Большой проект","en":"Big project","descRu":"Сохранить модель с 500 деталями с уникальными ID.","descEn":"Save a model with 500 uniquely identified parts."}'::jsonb),
('parts1000','{"id":"parts1000","cat":"construction","metric":"parts","target":1000,"xp":150,"rarity":"rare","icon":"layers","ru":"Архитектор","en":"Architect","descRu":"Сохранить модель с 1000 деталями с уникальными ID.","descEn":"Save a model with 1000 uniquely identified parts."}'::jsonb),
('mega','{"id":"mega","cat":"construction","metric":"parts","target":5000,"xp":500,"rarity":"epic","icon":"layers","ru":"Мегастройка","en":"Mega build","descRu":"Сохранить модель с 5000 деталями с уникальными ID.","descEn":"Save a model with 5000 uniquely identified parts."}'::jsonb),
('parts10000','{"id":"parts10000","cat":"construction","metric":"parts","target":10000,"xp":1000,"rarity":"legendary","icon":"layers","ru":"Титан строительства","en":"Building titan","descRu":"Сохранить модель с 10000 деталями с уникальными ID.","descEn":"Save a model with 10000 uniquely identified parts."}'::jsonb),
('designs10','{"id":"designs10","cat":"construction","metric":"designs","target":10,"xp":20,"rarity":"common","icon":"settings","ru":"Разнообразие","en":"Variety","descRu":"Использовать 10 разных артикулов в одной сохранённой модели.","descEn":"Use 10 distinct part designs in one saved model."}'::jsonb),
('designs25','{"id":"designs25","cat":"construction","metric":"designs","target":25,"xp":40,"rarity":"uncommon","icon":"settings","ru":"Знаток деталей","en":"Parts explorer","descRu":"Использовать 25 разных артикулов в одной сохранённой модели.","descEn":"Use 25 distinct part designs in one saved model."}'::jsonb),
('designs50','{"id":"designs50","cat":"construction","metric":"designs","target":50,"xp":75,"rarity":"rare","icon":"settings","ru":"Каталог в голове","en":"Parts expert","descRu":"Использовать 50 разных артикулов в одной сохранённой модели.","descEn":"Use 50 distinct part designs in one saved model."}'::jsonb),
('designs100','{"id":"designs100","cat":"construction","metric":"designs","target":100,"xp":150,"rarity":"epic","icon":"settings","ru":"Коллекционер","en":"Collector","descRu":"Использовать 100 разных артикулов в одной сохранённой модели.","descEn":"Use 100 distinct part designs in one saved model."}'::jsonb),
('designs250','{"id":"designs250","cat":"construction","metric":"designs","target":250,"xp":400,"rarity":"legendary","icon":"settings","ru":"Энциклопедия деталей","en":"Parts encyclopedia","descRu":"Использовать 250 разных артикулов в одной сохранённой модели.","descEn":"Use 250 distinct part designs in one saved model."}'::jsonb),
('models3','{"id":"models3","cat":"construction","metric":"models","target":3,"xp":30,"rarity":"uncommon","icon":"folder","ru":"Портфолио","en":"Portfolio","descRu":"Сохранить 3 непустых облачных моделей с различным содержимым.","descEn":"Save 3 nonempty cloud models with distinct contents."}'::jsonb),
('models5','{"id":"models5","cat":"construction","metric":"models","target":5,"xp":50,"rarity":"uncommon","icon":"folder","ru":"Мастерская растёт","en":"Growing workshop","descRu":"Сохранить 5 непустых облачных моделей с различным содержимым.","descEn":"Save 5 nonempty cloud models with distinct contents."}'::jsonb),
('models10','{"id":"models10","cat":"construction","metric":"models","target":10,"xp":100,"rarity":"rare","icon":"folder","ru":"Десять проектов","en":"Ten projects","descRu":"Сохранить 10 непустых облачных моделей с различным содержимым.","descEn":"Save 10 nonempty cloud models with distinct contents."}'::jsonb),
('models20','{"id":"models20","cat":"construction","metric":"models","target":20,"xp":200,"rarity":"epic","icon":"folder","ru":"Конструкторская коллекция","en":"Builder collection","descRu":"Сохранить 20 непустых облачных моделей с различным содержимым.","descEn":"Save 20 nonempty cloud models with distinct contents."}'::jsonb),
('days3','{"id":"days3","cat":"activity","metric":"days","target":3,"xp":20,"rarity":"common","icon":"icon-trophy","ru":"В ритме","en":"In the groove","descRu":"Сохранять непустые модели в 3 разных днях (UTC).","descEn":"Save nonempty models on 3 distinct UTC days."}'::jsonb),
('days7','{"id":"days7","cat":"activity","metric":"days","target":7,"xp":50,"rarity":"uncommon","icon":"icon-trophy","ru":"Неделя творчества","en":"Week of creativity","descRu":"Сохранять непустые модели в 7 разных днях (UTC).","descEn":"Save nonempty models on 7 distinct UTC days."}'::jsonb),
('days14','{"id":"days14","cat":"activity","metric":"days","target":14,"xp":100,"rarity":"rare","icon":"icon-trophy","ru":"Постоянство","en":"Consistency","descRu":"Сохранять непустые модели в 14 разных днях (UTC).","descEn":"Save nonempty models on 14 distinct UTC days."}'::jsonb),
('days30','{"id":"days30","cat":"activity","metric":"days","target":30,"xp":150,"rarity":"rare","icon":"icon-trophy","ru":"Месяц в мастерской","en":"A month in the workshop","descRu":"Сохранять непустые модели в 30 разных днях (UTC).","descEn":"Save nonempty models on 30 distinct UTC days."}'::jsonb),
('days90','{"id":"days90","cat":"activity","metric":"days","target":90,"xp":400,"rarity":"epic","icon":"icon-trophy","ru":"Инженерный марафон","en":"Engineering marathon","descRu":"Сохранять непустые модели в 90 разных днях (UTC).","descEn":"Save nonempty models on 90 distinct UTC days."}'::jsonb),
('days180','{"id":"days180","cat":"activity","metric":"days","target":180,"xp":750,"rarity":"legendary","icon":"icon-trophy","ru":"Полгода творчества","en":"Half-year of creativity","descRu":"Сохранять непустые модели в 180 разных днях (UTC).","descEn":"Save nonempty models on 180 distinct UTC days."}'::jsonb),
('firstPublication','{"id":"firstPublication","cat":"community","metric":"publications","target":1,"xp":50,"rarity":"uncommon","icon":"icon-cloud","ru":"Первый запуск","en":"First publication","descRu":"Опубликовать 1 непустых сборок с различным содержимым.","descEn":"Publish 1 nonempty builds with distinct contents."}'::jsonb),
('pub3','{"id":"pub3","cat":"community","metric":"publications","target":3,"xp":75,"rarity":"uncommon","icon":"icon-cloud","ru":"Открытая мастерская","en":"Open workshop","descRu":"Опубликовать 3 непустых сборок с различным содержимым.","descEn":"Publish 3 nonempty builds with distinct contents."}'::jsonb),
('pub5','{"id":"pub5","cat":"community","metric":"publications","target":5,"xp":100,"rarity":"rare","icon":"icon-cloud","ru":"Автор коллекции","en":"Collection author","descRu":"Опубликовать 5 непустых сборок с различным содержимым.","descEn":"Publish 5 nonempty builds with distinct contents."}'::jsonb),
('pub10','{"id":"pub10","cat":"community","metric":"publications","target":10,"xp":200,"rarity":"epic","icon":"icon-cloud","ru":"Вдохновитель","en":"Inspirer","descRu":"Опубликовать 10 непустых сборок с различным содержимым.","descEn":"Publish 10 nonempty builds with distinct contents."}'::jsonb),
('pub20','{"id":"pub20","cat":"community","metric":"publications","target":20,"xp":400,"rarity":"legendary","icon":"icon-cloud","ru":"Галерея мастера","en":"Master gallery","descRu":"Опубликовать 20 непустых сборок с различным содержимым.","descEn":"Publish 20 nonempty builds with distinct contents."}'::jsonb),
('likes1','{"id":"likes1","cat":"community","metric":"likes","target":1,"xp":10,"rarity":"common","icon":"icon-heart","ru":"Первый поклонник","en":"First admirer","descRu":"Получить лайки от 1 разных подтверждённых аккаунтов.","descEn":"Receive likes from 1 distinct verified accounts."}'::jsonb),
('likes10','{"id":"likes10","cat":"community","metric":"likes","target":10,"xp":50,"rarity":"uncommon","icon":"icon-heart","ru":"На заметке","en":"Getting noticed","descRu":"Получить лайки от 10 разных подтверждённых аккаунтов.","descEn":"Receive likes from 10 distinct verified accounts."}'::jsonb),
('likes25','{"id":"likes25","cat":"community","metric":"likes","target":25,"xp":100,"rarity":"rare","icon":"icon-heart","ru":"Любимец мастерской","en":"Workshop favorite","descRu":"Получить лайки от 25 разных подтверждённых аккаунтов.","descEn":"Receive likes from 25 distinct verified accounts."}'::jsonb),
('recognition','{"id":"recognition","cat":"community","metric":"likes","target":100,"xp":500,"rarity":"legendary","icon":"icon-heart","ru":"Признание сообщества","en":"Community recognition","descRu":"Получить лайки от 100 разных подтверждённых аккаунтов.","descEn":"Receive likes from 100 distinct verified accounts."}'::jsonb),
('likes1000','{"id":"likes1000","cat":"community","metric":"likes","target":1000,"xp":1000,"rarity":"legendary","icon":"icon-heart","ru":"Звезда BrickLab","en":"BrickLab star","descRu":"Получить лайки от 1000 разных подтверждённых аккаунтов.","descEn":"Receive likes from 1000 distinct verified accounts."}'::jsonb),
('followers1','{"id":"followers1","cat":"community","metric":"followers","target":1,"xp":10,"rarity":"common","icon":"icon-account","ru":"Первый подписчик","en":"First follower","descRu":"Получить 1 подписчиков с подтверждёнными аккаунтами.","descEn":"Gain 1 followers with verified accounts."}'::jsonb),
('followers10','{"id":"followers10","cat":"community","metric":"followers","target":10,"xp":50,"rarity":"uncommon","icon":"icon-account","ru":"Своя команда","en":"Your own crew","descRu":"Получить 10 подписчиков с подтверждёнными аккаунтами.","descEn":"Gain 10 followers with verified accounts."}'::jsonb),
('followers50','{"id":"followers50","cat":"community","metric":"followers","target":50,"xp":150,"rarity":"rare","icon":"icon-account","ru":"В центре внимания","en":"Spotlight","descRu":"Получить 50 подписчиков с подтверждёнными аккаунтами.","descEn":"Gain 50 followers with verified accounts."}'::jsonb),
('followers100','{"id":"followers100","cat":"community","metric":"followers","target":100,"xp":300,"rarity":"epic","icon":"icon-account","ru":"Лидер сообщества","en":"Community leader","descRu":"Получить 100 подписчиков с подтверждёнными аккаунтами.","descEn":"Gain 100 followers with verified accounts."}'::jsonb),
('age30','{"id":"age30","cat":"special","metric":"age","target":30,"xp":30,"rarity":"common","icon":"icon-account","ru":"Месяц с BrickLab","en":"A month with BrickLab","descRu":"С момента регистрации прошло 30 дней.","descEn":"Account age reaches 30 days."}'::jsonb),
('age90','{"id":"age90","cat":"special","metric":"age","target":90,"xp":75,"rarity":"uncommon","icon":"icon-account","ru":"Свой человек","en":"Regular","descRu":"С момента регистрации прошло 90 дней.","descEn":"Account age reaches 90 days."}'::jsonb),
('age180','{"id":"age180","cat":"special","metric":"age","target":180,"xp":150,"rarity":"rare","icon":"icon-account","ru":"Полгода вместе","en":"Half a year together","descRu":"С момента регистрации прошло 180 дней.","descEn":"Account age reaches 180 days."}'::jsonb),
('veteran','{"id":"veteran","cat":"special","metric":"age","target":365,"xp":500,"rarity":"unique","icon":"icon-account","ru":"Ветеран BrickLab","en":"BrickLab veteran","descRu":"С момента регистрации прошло 365 дней.","descEn":"Account age reaches 365 days."}'::jsonb),
('age730','{"id":"age730","cat":"special","metric":"age","target":730,"xp":750,"rarity":"unique","icon":"icon-account","ru":"Два года вместе","en":"Two years together","descRu":"С момента регистрации прошло 730 дней.","descEn":"Account age reaches 730 days."}'::jsonb),
('founder','{"id":"founder","cat":"special","metric":"founder","target":1,"xp":500,"rarity":"unique","icon":"icon-trophy","ru":"Основатель","en":"Founder","descRu":"Войти в число первых 100 зарегистрированных пользователей (с учётом сохранившихся аккаунтов до запуска наград).","descEn":"Join the first 100 registered users (existing accounts count at launch)."}'::jsonb),
('academy','{"id":"academy","cat":"learning","metric":"lesson","target":1,"xp":30,"rarity":"common","icon":"book","ru":"Первый урок","en":"First lesson","descRu":"Выполнить практическое задание Академии на сохранённой модели и ответить на контрольный вопрос.","descEn":"Complete a saved-model Academy exercise and answer its checkpoint."}'::jsonb),
('instruction','{"id":"instruction","cat":"learning","metric":null,"target":1,"xp":50,"rarity":"uncommon","icon":"book","ru":"По инструкции","en":"By the instructions","descRu":"Завершить подтверждённую сборку набора.","descEn":"Complete a verified set build."}'::jsonb),
('instruction5','{"id":"instruction5","cat":"learning","metric":null,"target":1,"xp":100,"rarity":"rare","icon":"book","ru":"Читатель схем","en":"Instruction reader","descRu":"Завершить 5 проверенных наборов.","descEn":"Complete 5 verified sets."}'::jsonb),
('instruction10','{"id":"instruction10","cat":"learning","metric":null,"target":1,"xp":250,"rarity":"epic","icon":"book","ru":"Мастер инструкций","en":"Instruction master","descRu":"Завершить 10 проверенных наборов.","descEn":"Complete 10 verified sets."}'::jsonb),
('gears','{"id":"gears","cat":"mechanics","metric":"gears","target":1,"xp":250,"rarity":"epic","icon":"settings","ru":"Повелитель шестерён","en":"Gear master","descRu":"Подтвердить рабочую трансмиссию.","descEn":"Verify a working transmission."}'::jsonb),
('firstDrive','{"id":"firstDrive","cat":"mechanics","metric":"drive","target":1,"xp":100,"rarity":"rare","icon":"play","ru":"Первый заезд","en":"First drive","descRu":"Пройти серверную проверку движения на ровной площадке в кинематической симуляции.","descEn":"Pass the server-side flat-ground kinematic driving test."}'::jsonb),
('engine','{"id":"engine","cat":"mechanics","metric":"engine","target":1,"xp":250,"rarity":"epic","icon":"settings","ru":"Сердце машины","en":"Machine heart","descRu":"Подтвердить поршневой двигатель.","descEn":"Verify a piston engine."}'::jsonb),
('gearbox','{"id":"gearbox","cat":"mechanics","metric":"gearbox","target":1,"xp":500,"rarity":"legendary","icon":"settings","ru":"Король трансмиссий","en":"Transmission king","descRu":"Подтвердить две разные передаточные ступени через переключение.","descEn":"Verify two distinct transmission ratios by shifting."}'::jsonb),
('tracks','{"id":"tracks","cat":"mechanics","metric":"tracks","target":1,"xp":150,"rarity":"rare","icon":"layers","ru":"На гусеницах","en":"On tracks","descRu":"Подтвердить гусеничный механизм.","descEn":"Verify a tracked mechanism."}'::jsonb),
('suspension','{"id":"suspension","cat":"mechanics","metric":"suspension","target":1,"xp":150,"rarity":"rare","icon":"settings","ru":"Мягкая посадка","en":"Soft landing","descRu":"Подтвердить рабочую подвеску.","descEn":"Verify a working suspension."}'::jsonb),
('belts','{"id":"belts","cat":"mechanics","metric":"belts","target":1,"xp":150,"rarity":"rare","icon":"settings","ru":"Ременная передача","en":"Belt drive","descRu":"Подтвердить передачу вращения ремнём.","descEn":"Verify belt transmission."}'::jsonb),
('bugs','{"id":"bugs","cat":"community","metric":"bugs","target":10,"xp":250,"rarity":"epic","icon":"icon-bug","ru":"Охотник за багами","en":"Bug hunter","descRu":"10 подтверждённых баг-репортов.","descEn":"10 confirmed bug reports."}'::jsonb),
('bureau','{"id":"bureau","cat":"community","metric":null,"target":1,"xp":100,"rarity":"rare","icon":"icon-account","ru":"Конструкторское бюро","en":"Design bureau","descRu":"Подтвердить совместную сборку.","descEn":"Verify a collaborative build."}'::jsonb),
('beta','{"id":"beta","cat":"special","metric":null,"target":1,"xp":0,"rarity":"unique","icon":"icon-flask","ru":"Первопроходец","en":"Pathfinder","descRu":"Подтверждённое участие в ОБТ.","descEn":"Verified open beta participation."}'::jsonb),
('firstEngineer','{"id":"firstEngineer","cat":"special","metric":null,"target":1,"xp":0,"rarity":"unique","icon":"icon-trophy","ru":"Первый инженер","en":"First engineer","descRu":"Победа в первом конкурсе.","descEn":"Win the first competition."}'::jsonb),
('worldPioneer','{"id":"worldPioneer","cat":"special","metric":null,"target":1,"xp":0,"rarity":"unique","icon":"icon-flask","ru":"Пионер нового мира","en":"World pioneer","descRu":"Участие в первом тесте BrickLab World.","descEn":"Join the first BrickLab World test."}'::jsonb),
('winter','{"id":"winter","cat":"special","metric":null,"target":1,"xp":0,"rarity":"unique","icon":"icon-trophy","ru":"Зимняя мастерская","en":"Winter workshop","descRu":"Участие в официальном зимнем событии.","descEn":"Join an official winter event."}'::jsonb);
ALTER TABLE bricklab.workshop_awards DROP CONSTRAINT workshop_awards_award_check;
ALTER TABLE bricklab.workshop_awards ADD FOREIGN KEY(award) REFERENCES bricklab.achievement_definitions(id);
REVOKE ALL ON bricklab.achievement_definitions FROM PUBLIC,bricklab_app;
GRANT SELECT ON bricklab.achievement_definitions TO bricklab_app;
-- Server-issued evidence only. The HTTP handler obtains the owner's exact saved revision
-- and runs the isolated solver; no HTTP route accepts evidence or XP from the client.
CREATE TABLE bricklab.achievement_evidence (
 user_id uuid NOT NULL REFERENCES bricklab.users(id) ON DELETE CASCADE,
 project_id uuid NOT NULL, revision integer NOT NULL,
 metric text NOT NULL CHECK(metric IN ('lesson','gears','drive','engine','gearbox','tracks','suspension','belts')),
 checked_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,project_id,revision,metric),
 FOREIGN KEY(project_id,revision) REFERENCES bricklab.project_revisions(project_id,revision) ON DELETE CASCADE
);
ALTER TABLE bricklab.achievement_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY evidence_read ON bricklab.achievement_evidence FOR SELECT TO bricklab_app USING(user_id=nullif(current_setting('bricklab.user_id',true),'')::uuid);
CREATE POLICY evidence_write ON bricklab.achievement_evidence FOR INSERT TO bricklab_app WITH CHECK(user_id=nullif(current_setting('bricklab.user_id',true),'')::uuid AND EXISTS(SELECT 1 FROM bricklab.projects p WHERE p.id=project_id AND p.owner_id=user_id));
REVOKE ALL ON bricklab.achievement_evidence FROM PUBLIC,bricklab_app;
GRANT SELECT,INSERT(user_id,project_id,revision,metric) ON bricklab.achievement_evidence TO bricklab_app;
ALTER FUNCTION bricklab.refresh_achievements() RENAME TO refresh_builtin_achievements;
REVOKE ALL ON FUNCTION bricklab.refresh_builtin_achievements() FROM PUBLIC,bricklab_app;
CREATE FUNCTION bricklab.refresh_achievements() RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 DECLARE uid uuid; m jsonb;
 BEGIN
 uid:=nullif(current_setting('bricklab.user_id',true),'')::uuid;
 m:=bricklab.refresh_builtin_achievements();
 m:=m||coalesce((SELECT jsonb_object_agg(metric,n) FROM (SELECT metric,count(DISTINCT project_id) n FROM bricklab.achievement_evidence WHERE user_id=uid GROUP BY metric) e),'{}'::jsonb);
 INSERT INTO bricklab.workshop_awards(user_id,award)
 SELECT uid,d.id FROM bricklab.achievement_definitions d
 WHERE d.definition->>'metric' IN ('cloud','parts','designs','models','days','publications','likes','followers','age','lesson','gears','drive','engine','gearbox','tracks','suspension','belts','bugs') AND coalesce((m->>(d.definition->>'metric'))::numeric,0)>=(d.definition->>'target')::numeric
 ON CONFLICT DO NOTHING;
 RETURN m;
 END; $$;
REVOKE ALL ON FUNCTION bricklab.refresh_achievements() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.refresh_achievements() TO bricklab_app;
ALTER TABLE bricklab.admin_audit DROP CONSTRAINT admin_audit_action_check;
ALTER TABLE bricklab.admin_audit ADD CONSTRAINT admin_audit_action_check CHECK(action IN ('block','unblock','revoke_sessions','hide_comment','dismiss_reports','unpublish_build','unpublish_profile','dismiss_build_reports','confirm_bug','grant_achievement','create_achievement'));
CREATE FUNCTION bricklab.admin_create_achievement(p jsonb) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 DECLARE uid uuid; key text; metric text;
 BEGIN
 uid:=nullif(current_setting('bricklab.user_id',true),'')::uuid;
 IF NOT bricklab.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 key:=p->>'id'; metric:=p->>'metric';
 IF key IS NULL OR key !~ '^custom-[a-z0-9-]{1,39}$' OR coalesce(p->>'cat','') NOT IN ('construction','mechanics','learning','community','activity','special')
 OR coalesce(p->>'rarity','') NOT IN ('common','uncommon','rare','epic','legendary','unique')
 OR coalesce(p->>'icon','') NOT IN ('layers','settings','icon-trophy','book','play','icon-heart','icon-account','icon-cloud','icon-bug','icon-flask','folder')
 OR (p ? 'hidden' AND jsonb_typeof(p->'hidden')<>'boolean')
 OR (metric IS NOT NULL AND metric NOT IN ('cloud','parts','designs','models','days','publications','likes','followers','age','lesson','gears','drive','engine','gearbox','tracks','suspension','belts','bugs'))
 OR coalesce(p->>'xp','') !~ '^[0-9]{1,4}$' OR (p->>'xp')::int>5000
 OR coalesce(p->>'target','') !~ '^[1-9][0-9]{0,5}$' OR (p->>'target')::int>100000
 OR (metric IS NULL AND (p->>'target')::int<>1)
 OR EXISTS(SELECT 1 FROM unnest(ARRAY['ru','en','descRu','descEn']) k WHERE coalesce(length(btrim(p->>k)),0) NOT BETWEEN 1 AND 240)
 THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(810031,111);
 IF (SELECT count(*) FROM bricklab.achievement_definitions WHERE id LIKE 'custom-%')>=500 THEN RETURN false; END IF;
 INSERT INTO bricklab.achievement_definitions(id,definition) VALUES(key,p) ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN RETURN false; END IF;
 INSERT INTO bricklab.admin_audit(actor_id,action,target_id,reason) VALUES(uid,'create_achievement',uid,key);
 RETURN true;
 END; $$;
REVOKE ALL ON FUNCTION bricklab.admin_create_achievement(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.admin_create_achievement(jsonb) TO bricklab_app;
CREATE OR REPLACE FUNCTION bricklab.admin_grant_achievement(p_target uuid,p_award text,p_reason text) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 DECLARE uid uuid;
 BEGIN
 uid:=nullif(current_setting('bricklab.user_id',true),'')::uuid;
 IF NOT bricklab.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM bricklab.achievement_definitions WHERE id=p_award AND definition->>'metric' IS NULL) OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 450 THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_target::text,312042));
 IF NOT EXISTS(SELECT 1 FROM bricklab.users WHERE id=p_target AND blocked_at IS NULL) THEN RETURN false; END IF;
 INSERT INTO bricklab.workshop_awards(user_id,award) VALUES(p_target,p_award) ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN RETURN false; END IF;
 INSERT INTO bricklab.admin_audit(actor_id,action,target_id,reason) VALUES(uid,'grant_achievement',p_target,p_award||': '||btrim(p_reason));
 RETURN true;
 END; $$;
CREATE TABLE bricklab.achievement_appearance (
 user_id uuid PRIMARY KEY REFERENCES bricklab.users(id) ON DELETE CASCADE,
 style text CHECK(style IN ('forge','masterwork','pioneer','starlight','marathon','academy'))
);
ALTER TABLE bricklab.achievement_appearance ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_achievement_appearance ON bricklab.achievement_appearance FOR SELECT TO bricklab_app USING(user_id=nullif(current_setting('bricklab.user_id',true),'')::uuid);
REVOKE ALL ON bricklab.achievement_appearance FROM PUBLIC,bricklab_app;
GRANT SELECT ON bricklab.achievement_appearance TO bricklab_app;
CREATE FUNCTION bricklab.equip_achievement_style(p_style text) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 DECLARE uid uuid; required text;
 BEGIN
 uid:=nullif(current_setting('bricklab.user_id',true),'')::uuid;
 IF uid IS NULL OR NOT EXISTS(SELECT 1 FROM bricklab.users WHERE id=uid AND blocked_at IS NULL) THEN RETURN false; END IF;
 required:=CASE p_style WHEN 'forge' THEN 'gears' WHEN 'masterwork' THEN 'mega' WHEN 'pioneer' THEN 'founder' WHEN 'starlight' THEN 'recognition' WHEN 'marathon' THEN 'days90' WHEN 'academy' THEN 'academy' END;
 IF p_style IS NOT NULL AND (required IS NULL OR NOT EXISTS(SELECT 1 FROM bricklab.workshop_awards WHERE user_id=uid AND award=required)) THEN RETURN false; END IF;
 INSERT INTO bricklab.achievement_appearance(user_id,style) VALUES(uid,p_style) ON CONFLICT(user_id) DO UPDATE SET style=excluded.style;
 RETURN true;
 END; $$;
REVOKE ALL ON FUNCTION bricklab.equip_achievement_style(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.equip_achievement_style(text) TO bricklab_app;
CREATE FUNCTION bricklab.public_achievement_details(p_public uuid) RETURNS jsonb
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 SELECT jsonb_build_object('xp',coalesce((SELECT sum((d.definition->>'xp')::integer) FROM bricklab.workshop_awards w JOIN bricklab.achievement_definitions d ON d.id=w.award WHERE w.user_id=p.user_id),0),
 'style',(SELECT style FROM bricklab.achievement_appearance a WHERE a.user_id=p.user_id),
 'definitions',coalesce((SELECT jsonb_agg(d.definition) FROM bricklab.achievement_definitions d WHERE d.id LIKE 'custom-%' AND d.id=ANY(bricklab.public_achievement_showcase(p.public_id))),'[]'::jsonb))
 FROM bricklab.public_profiles p JOIN bricklab.users u ON u.id=p.user_id WHERE p.public_id=p_public AND p.unified AND p.portfolio->'blocks' @> '[{"key":"awards","visible":true}]'::jsonb AND u.blocked_at IS NULL
 $$;
REVOKE ALL ON FUNCTION bricklab.public_achievement_details(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.public_achievement_details(uuid) TO bricklab_app;
CREATE FUNCTION bricklab.achievement_rankings(p_offset integer) RETURNS TABLE(id uuid,"displayName" text,xp integer,position integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,bricklab AS $$
 WITH scores AS (SELECT w.user_id,sum((d.definition->>'xp')::integer)::int xp FROM bricklab.workshop_awards w JOIN bricklab.achievement_definitions d ON d.id=w.award GROUP BY w.user_id),
 ranked AS (SELECT p.public_id,p.display_name,coalesce(s.xp,0) score,rank() OVER(ORDER BY coalesce(s.xp,0) DESC)::int place FROM bricklab.public_profiles p JOIN bricklab.users u ON u.id=p.user_id LEFT JOIN scores s ON s.user_id=p.user_id WHERE p.unified AND p.portfolio->'blocks' @> '[{"key":"awards","visible":true}]'::jsonb AND u.blocked_at IS NULL)
 SELECT public_id,display_name,score,place FROM ranked ORDER BY score DESC,public_id LIMIT 51 OFFSET greatest(0,least(p_offset,10000))
 $$;
REVOKE ALL ON FUNCTION bricklab.achievement_rankings(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.achievement_rankings(integer) TO bricklab_app;
