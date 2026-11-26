#!/usr/bin/env bash
# Run from production checkout; never connect to its database.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
REF="${1:-origin/feature/payment-reconciliation}"
SHA=$(git rev-parse --verify "$REF^{commit}")
TMP=$(mktemp -d /tmp/bricklab-commerce-XXXXXX)
DB="bricklab-commerce-check-$$"
trap 'docker rm -f "$DB" >/dev/null 2>&1 || true; rm -rf -- "$TMP"' EXIT
git archive "$SHA" | tar -x -C "$TMP"
chown -R 1000:1000 "$TMP"
chmod 755 "$TMP"
echo "=== TEST COMMIT: $SHA ==="
python3 -m py_compile "$TMP/scripts/publish-legal.py" "$TMP/scripts/configure-commerce-telegram.py"
docker run --rm --user 1000:1000 -e npm_config_cache=/tmp/npm-cache -v "$TMP:/tests" -w /tests bricklab-test-runner:local sh -ec '
 npm ci --include=dev --ignore-scripts --no-audit --no-fund
 for f in server/index.js server/payments.js server/yookassa.js server/db/commerce-store.js server/db/auth-store.js server/payment-reconciliation.js server/commerce-telegram.js src/menu/store.js; do node --check "$f"; done
 npm test -- --test-concurrency=1
'
DBPASS=$(openssl rand -hex 24)
APPPASS=$(openssl rand -hex 24)
docker run -d --rm --name "$DB" -e POSTGRES_USER=bricklab_admin -e POSTGRES_DB=bricklab_commerce_check -e POSTGRES_PASSWORD="$DBPASS" -v "$TMP:/repo:ro" postgres:16
for i in $(seq 1 40); do
 if docker exec "$DB" pg_isready -h 127.0.0.1 -U bricklab_admin -d bricklab_commerce_check; then break; fi
 sleep 1
done
docker exec -e PGHOST=127.0.0.1 -e PGDATABASE=bricklab_commerce_check -e PGUSER=bricklab_admin -e PGPASSWORD="$DBPASS" -e BRICKLAB_APP_PASSWORD="$APPPASS" "$DB" sh /repo/server/db/setup.sh
docker exec -e PGPASSWORD="$DBPASS" "$DB" psql -X -h 127.0.0.1 -U bricklab_admin -d bricklab_commerce_check -v ON_ERROR_STOP=1 -f /repo/tests/commerce-db.sql
docker run --rm --network "container:$DB" --user 1000:1000 -e PGHOST=127.0.0.1 -e PGPORT=5432 -e PGDATABASE=bricklab_commerce_check -e PGUSER=bricklab_app -e PGPASSWORD="$APPPASS" -e COMMERCE_ADMIN_PASSWORD="$DBPASS" -e BRICKLAB_COMMERCE_INTEGRATION=1 -v "$TMP:/tests" -w /tests bricklab-test-runner:local node --test tests/commerce-upgrades.test.js tests/commerce-yookassa.test.js tests/commerce-unified.test.js tests/commerce-refund-telegram.test.js tests/commerce-live.test.js
echo "=== ALL CHECKS PASSED: $SHA ==="
