CREATE TABLE bricklab.bureaus (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL REFERENCES bricklab.users(id) ON DELETE CASCADE,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 80),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE bricklab.bureau_members (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bureau_id uuid NOT NULL REFERENCES bricklab.bureaus(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES bricklab.users(id) ON DELETE CASCADE,
 display_name text NOT NULL CHECK(length(btrim(display_name)) BETWEEN 1 AND 80),
 role text NOT NULL CHECK(role IN ('editor','viewer')),status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active')),
 UNIQUE(bureau_id,user_id)
);
CREATE INDEX bureau_members_user ON bricklab.bureau_members(user_id);
-- Owner-controlled helper bypasses recursive membership RLS, returns only the current session's role.
CREATE FUNCTION bricklab.bureau_role(target uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT CASE WHEN b.owner_id=nullif(current_setting('bricklab.user_id',true),'')::uuid THEN 'owner'
 WHEN m.status='active' THEN m.role WHEN m.status='pending' THEN 'pending' ELSE NULL END
 FROM bricklab.bureaus b LEFT JOIN bricklab.bureau_members m ON m.bureau_id=b.id AND m.user_id=nullif(current_setting('bricklab.user_id',true),'')::uuid WHERE b.id=target
$$;
REVOKE ALL ON FUNCTION bricklab.bureau_role(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bricklab.bureau_role(uuid) TO bricklab_app;
ALTER TABLE bricklab.bureaus ENABLE ROW LEVEL SECURITY;
ALTER TABLE bricklab.bureau_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY bureau_read ON bricklab.bureaus FOR SELECT TO bricklab_app USING(owner_id=nullif(current_setting('bricklab.user_id',true),'')::uuid OR bricklab.bureau_role(id) IS NOT NULL);
CREATE POLICY bureau_create ON bricklab.bureaus FOR INSERT TO bricklab_app WITH CHECK(owner_id=nullif(current_setting('bricklab.user_id',true),'')::uuid);
CREATE POLICY member_read ON bricklab.bureau_members FOR SELECT TO bricklab_app USING(user_id=nullif(current_setting('bricklab.user_id',true),'')::uuid OR bricklab.bureau_role(bureau_id)='owner');
CREATE POLICY member_invite ON bricklab.bureau_members FOR INSERT TO bricklab_app WITH CHECK(bricklab.bureau_role(bureau_id)='owner' AND status='pending' AND user_id<>nullif(current_setting('bricklab.user_id',true),'')::uuid);
CREATE POLICY member_accept ON bricklab.bureau_members FOR UPDATE TO bricklab_app USING(user_id=nullif(current_setting('bricklab.user_id',true),'')::uuid AND status='pending') WITH CHECK(user_id=nullif(current_setting('bricklab.user_id',true),'')::uuid AND status='active');
CREATE POLICY member_manage ON bricklab.bureau_members FOR UPDATE TO bricklab_app USING(bricklab.bureau_role(bureau_id)='owner') WITH CHECK(bricklab.bureau_role(bureau_id)='owner');
CREATE POLICY member_remove ON bricklab.bureau_members FOR DELETE TO bricklab_app USING(user_id=nullif(current_setting('bricklab.user_id',true),'')::uuid OR bricklab.bureau_role(bureau_id)='owner');
GRANT SELECT ON bricklab.bureaus,bricklab.bureau_members TO bricklab_app;
GRANT INSERT(owner_id,name) ON bricklab.bureaus TO bricklab_app;
GRANT INSERT(bureau_id,user_id,display_name,role),UPDATE(role,status),DELETE ON bricklab.bureau_members TO bricklab_app;

CREATE TABLE bricklab.bureau_projects (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bureau_id uuid NOT NULL REFERENCES bricklab.bureaus(id) ON DELETE CASCADE,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 120),head_revision integer NOT NULL DEFAULT 1 CHECK(head_revision BETWEEN 1 AND 50),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE bricklab.bureau_revisions (
 project_id uuid NOT NULL REFERENCES bricklab.bureau_projects(id) ON DELETE CASCADE,
 revision integer NOT NULL CHECK(revision BETWEEN 1 AND 50),author_id uuid REFERENCES bricklab.users(id) ON DELETE SET NULL,
 author_name text NOT NULL CHECK(length(author_name) BETWEEN 1 AND 80),
 document jsonb NOT NULL CHECK(jsonb_typeof(document)='object' AND octet_length(document::text)<=4194304),
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(project_id,revision)
);
CREATE INDEX bureau_projects_bureau ON bricklab.bureau_projects(bureau_id);
ALTER TABLE bricklab.bureau_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE bricklab.bureau_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY team_project_read ON bricklab.bureau_projects FOR SELECT TO bricklab_app USING(bricklab.bureau_role(bureau_id) IN ('owner','editor','viewer'));
CREATE POLICY team_project_create ON bricklab.bureau_projects FOR INSERT TO bricklab_app WITH CHECK(bricklab.bureau_role(bureau_id) IN ('owner','editor'));
CREATE POLICY team_project_update ON bricklab.bureau_projects FOR UPDATE TO bricklab_app USING(bricklab.bureau_role(bureau_id) IN ('owner','editor')) WITH CHECK(bricklab.bureau_role(bureau_id) IN ('owner','editor'));
CREATE POLICY team_revision_read ON bricklab.bureau_revisions FOR SELECT TO bricklab_app USING(EXISTS(SELECT 1 FROM bricklab.bureau_projects p WHERE p.id=project_id));
CREATE POLICY team_revision_create ON bricklab.bureau_revisions FOR INSERT TO bricklab_app WITH CHECK(author_id=nullif(current_setting('bricklab.user_id',true),'')::uuid AND EXISTS(SELECT 1 FROM bricklab.bureau_projects p WHERE p.id=project_id AND bricklab.bureau_role(p.bureau_id) IN ('owner','editor')));
GRANT SELECT ON bricklab.bureau_projects,bricklab.bureau_revisions TO bricklab_app;
GRANT INSERT(bureau_id,name),UPDATE(name,head_revision,updated_at) ON bricklab.bureau_projects TO bricklab_app;
GRANT INSERT(project_id,revision,author_id,author_name,document) ON bricklab.bureau_revisions TO bricklab_app;
