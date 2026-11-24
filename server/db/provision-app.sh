#!/bin/sh
set -eu
: "${BRICKLAB_APP_PASSWORD:?Set a separate database application password}"
# Never interpolate credentials into SQL or log the generated command.
psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
\getenv app_password BRICKLAB_APP_PASSWORD
SET password_encryption = 'scram-sha-256';
SELECT format('ALTER ROLE bricklab_app LOGIN PASSWORD %L', :'app_password') \gexec
SQL
