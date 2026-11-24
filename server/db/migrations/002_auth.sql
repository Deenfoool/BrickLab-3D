ALTER TABLE bricklab.users ADD COLUMN password_hash text;
ALTER TABLE bricklab.users ADD CONSTRAINT password_hash_size CHECK (password_hash IS NULL OR length(password_hash) <= 256);
CREATE TABLE bricklab.sessions (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid NOT NULL REFERENCES bricklab.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL CHECK (expires_at > created_at)
);
CREATE INDEX sessions_expiry ON bricklab.sessions (expires_at);
CREATE INDEX sessions_user ON bricklab.sessions (user_id);
CREATE ROLE bricklab_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA bricklab TO bricklab_app;
GRANT SELECT (id, email, display_name, password_hash), INSERT (email, display_name, password_hash) ON bricklab.users TO bricklab_app;
GRANT SELECT, INSERT, DELETE ON bricklab.sessions TO bricklab_app;
