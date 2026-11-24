CREATE TABLE bricklab.community_comments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 build_id uuid NOT NULL REFERENCES bricklab.public_builds(public_id) ON DELETE CASCADE,
 author_id uuid NOT NULL REFERENCES bricklab.public_profiles(public_id) ON DELETE CASCADE,
 parent_id uuid,
 body text CHECK(body IS NULL OR length(btrim(body)) BETWEEN 1 AND 1500),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,build_id),
 FOREIGN KEY(parent_id,build_id) REFERENCES bricklab.community_comments(id,build_id) ON DELETE CASCADE
);
CREATE INDEX community_comments_build ON bricklab.community_comments(build_id,created_at DESC,id);
CREATE INDEX community_comments_author ON bricklab.community_comments(author_id,created_at DESC);
CREATE TABLE bricklab.community_comment_reports (
 reporter_id uuid NOT NULL REFERENCES bricklab.users(id) ON DELETE CASCADE,
 comment_id uuid NOT NULL REFERENCES bricklab.community_comments(id) ON DELETE CASCADE,
 reason text NOT NULL CHECK(reason IN ('spam','abuse','other')),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(reporter_id,comment_id)
);
ALTER TABLE bricklab.community_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE bricklab.community_comment_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY comments_read ON bricklab.community_comments FOR SELECT TO bricklab_app USING(true);
CREATE POLICY comments_insert ON bricklab.community_comments FOR INSERT TO bricklab_app WITH CHECK(body IS NOT NULL AND EXISTS(SELECT 1 FROM bricklab.public_profiles p WHERE p.public_id=community_comments.author_id AND p.user_id=nullif(current_setting('bricklab.user_id',true),'')::uuid));
CREATE POLICY comments_remove ON bricklab.community_comments FOR UPDATE TO bricklab_app USING(EXISTS(SELECT 1 FROM bricklab.public_profiles p WHERE p.public_id=community_comments.author_id AND p.user_id=nullif(current_setting('bricklab.user_id',true),'')::uuid)) WITH CHECK(body IS NULL AND EXISTS(SELECT 1 FROM bricklab.public_profiles p WHERE p.public_id=community_comments.author_id AND p.user_id=nullif(current_setting('bricklab.user_id',true),'')::uuid));
CREATE POLICY own_reports ON bricklab.community_comment_reports FOR SELECT TO bricklab_app USING(reporter_id=nullif(current_setting('bricklab.user_id',true),'')::uuid);
CREATE POLICY insert_reports ON bricklab.community_comment_reports FOR INSERT TO bricklab_app WITH CHECK(reporter_id=nullif(current_setting('bricklab.user_id',true),'')::uuid AND EXISTS(SELECT 1 FROM bricklab.community_comments c JOIN bricklab.public_profiles p ON p.public_id=c.author_id WHERE c.id=community_comment_reports.comment_id AND c.body IS NOT NULL AND p.user_id<>community_comment_reports.reporter_id));
GRANT SELECT ON bricklab.community_comments,bricklab.community_comment_reports TO bricklab_app;
GRANT INSERT(build_id,author_id,parent_id,body),UPDATE(body) ON bricklab.community_comments TO bricklab_app;
GRANT INSERT(reporter_id,comment_id,reason) ON bricklab.community_comment_reports TO bricklab_app;
-- Dynamic ranking: only active publications and received reactions count.
CREATE VIEW bricklab.community_reputation AS
 SELECT p.public_id AS author_id,coalesce(b.builds,0)::int AS builds,
 coalesce(b.likes,0)::int AS likes,coalesce(b.downloads,0)::int AS downloads,
 coalesce(f.followers,0)::int AS followers,
 (5*coalesce(b.likes,0)+3*coalesce(b.downloads,0)+2*coalesce(f.followers,0))::bigint AS score
 FROM bricklab.public_profiles p
 LEFT JOIN (SELECT b.author_id,count(*) AS builds,sum(coalesce(l.likes,0)) AS likes,sum(coalesce(e.downloads,0)) AS downloads
 FROM bricklab.public_builds b LEFT JOIN bricklab.community_like_counts l ON l.build_id=b.public_id LEFT JOIN bricklab.community_event_counts e ON e.build_id=b.public_id GROUP BY b.author_id) b ON b.author_id=p.public_id
 LEFT JOIN bricklab.community_follow_counts f ON f.author_id=p.public_id;
GRANT SELECT ON bricklab.community_reputation TO bricklab_app;
