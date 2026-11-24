ALTER TABLE bricklab.public_builds ADD COLUMN category text NOT NULL DEFAULT 'other' CHECK(category IN ('vehicles','mechanisms','architecture','robots','other'));
ALTER TABLE bricklab.public_builds ADD COLUMN part_count integer GENERATED ALWAYS AS (jsonb_array_length(document->'parts')) STORED;
GRANT INSERT(category),UPDATE(category) ON bricklab.public_builds TO bricklab_app;
CREATE INDEX public_builds_category_recent ON bricklab.public_builds(category,published_at DESC,public_id);
