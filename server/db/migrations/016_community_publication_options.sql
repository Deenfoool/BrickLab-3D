-- Existing publications retain their current access; new UI sends explicit preferences.
ALTER TABLE bricklab.public_builds
 ADD COLUMN allow_download boolean NOT NULL DEFAULT true,
 ADD COLUMN allow_comments boolean NOT NULL DEFAULT true,
 ADD COLUMN allow_remix boolean NOT NULL DEFAULT false,
 ADD COLUMN difficulty text NOT NULL DEFAULT 'unspecified' CHECK(difficulty IN ('unspecified','easy','medium','hard','expert')),
 ADD COLUMN tags text[] NOT NULL DEFAULT '{}' CHECK(cardinality(tags)<=8),
 ADD COLUMN work_type text NOT NULL DEFAULT 'original' CHECK(work_type IN ('original','remix','instruction')),
 ADD COLUMN attribution text NOT NULL DEFAULT '' CHECK(length(attribution)<=250),
 ADD COLUMN origin_id uuid,
 ADD COLUMN images bytea[] NOT NULL DEFAULT '{}' CHECK(cardinality(images)<=4),
 ADD CONSTRAINT remix_needs_download CHECK(NOT allow_remix OR allow_download);
GRANT INSERT(allow_download,allow_comments,allow_remix,difficulty,tags,work_type,attribution,origin_id,images),
 UPDATE(allow_download,allow_comments,allow_remix,difficulty,tags,work_type,attribution,images) ON bricklab.public_builds TO bricklab_app;

CREATE TABLE bricklab.community_bookmarks (
 user_id uuid NOT NULL REFERENCES bricklab.users(id) ON DELETE CASCADE,
 build_id uuid NOT NULL REFERENCES bricklab.public_builds(public_id) ON DELETE CASCADE,
 PRIMARY KEY(user_id,build_id)
);
ALTER TABLE bricklab.community_bookmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_bookmarks ON bricklab.community_bookmarks FOR ALL TO bricklab_app
 USING(user_id=nullif(current_setting('bricklab.user_id',true),'')::uuid)
 WITH CHECK(user_id=nullif(current_setting('bricklab.user_id',true),'')::uuid);
GRANT SELECT,INSERT,DELETE ON bricklab.community_bookmarks TO bricklab_app;

CREATE TABLE bricklab.community_build_reports (
 reporter_id uuid NOT NULL REFERENCES bricklab.users(id) ON DELETE CASCADE,
 build_id uuid NOT NULL REFERENCES bricklab.public_builds(public_id) ON DELETE CASCADE,
 reason text NOT NULL CHECK(reason IN ('spam','abuse','copyright','other')),
 created_at timestamptz NOT NULL DEFAULT now(),
 resolved_at timestamptz,
 PRIMARY KEY(reporter_id,build_id)
);
ALTER TABLE bricklab.community_build_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_build_reports ON bricklab.community_build_reports FOR SELECT TO bricklab_app
 USING(reporter_id=nullif(current_setting('bricklab.user_id',true),'')::uuid OR bricklab.is_admin());
CREATE POLICY insert_build_reports ON bricklab.community_build_reports FOR INSERT TO bricklab_app
 WITH CHECK(reporter_id=nullif(current_setting('bricklab.user_id',true),'')::uuid AND EXISTS(
 SELECT 1 FROM bricklab.public_builds b JOIN bricklab.public_profiles p ON p.public_id=b.author_id
 WHERE b.public_id=community_build_reports.build_id AND p.user_id<>community_build_reports.reporter_id));
CREATE POLICY admin_build_reports_update ON bricklab.community_build_reports FOR UPDATE TO bricklab_app
 USING(bricklab.is_admin()) WITH CHECK(bricklab.is_admin());
GRANT SELECT,INSERT(reporter_id,build_id,reason),UPDATE(resolved_at) ON bricklab.community_build_reports TO bricklab_app;
CREATE INDEX community_build_reports_pending ON bricklab.community_build_reports(build_id) WHERE resolved_at IS NULL;

-- Keep existing comments readable and removable; disallow new comments when closed.
ALTER POLICY comments_insert ON bricklab.community_comments WITH CHECK(
 body IS NOT NULL AND EXISTS(SELECT 1 FROM bricklab.public_profiles p WHERE p.public_id=community_comments.author_id AND p.user_id=nullif(current_setting('bricklab.user_id',true),'')::uuid)
 AND EXISTS(SELECT 1 FROM bricklab.public_builds b WHERE b.public_id=community_comments.build_id AND b.allow_comments)
);
