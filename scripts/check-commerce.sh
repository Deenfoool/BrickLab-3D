#!/usr/bin/env bash
# Run from production checkout; never connect to its database.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
REF="${1:-HEAD}"
SHA=$(git rev-parse --verify "$REF^{commit}")
TMP=$(mktemp -d /tmp/bricklab-commerce-XXXXXX)
DB="bricklab-commerce-check-$$"
trap 'docker rm -f "$DB" >/dev/null 2>&1 || true; rm -rf -- "$TMP"' EXIT
git archive "$SHA" | tar -x -C "$TMP"
chown -R 1000:1000 "$TMP"
chmod 755 "$TMP"
echo "=== TEST COMMIT: $SHA ==="
python3 -m py_compile "$TMP/scripts/publish-legal.py" "$TMP/scripts/configure-commerce-telegram.py" "$TMP/scripts/configure-commerce-live.py" "$TMP/scripts/npd/configure.py" "$TMP/scripts/npd/worker.py" "$TMP/scripts/npd/operation.py" "$TMP/scripts/npd/test_operation.py"
docker run --rm --user 1000:1000 -e npm_config_cache=/tmp/npm-cache -v "$TMP:/tests" -w /tests bricklab-test-runner:local sh -ec '
 npm ci --include=dev --ignore-scripts --no-audit --no-fund
 for f in server/index.js server/payments.js server/yookassa.js server/db/commerce-store.js server/db/auth-store.js server/payment-reconciliation.js server/commerce-telegram.js server/receipt-delivery.js src/menu/store.js src/sets/catalog.js src/sets/instruction-offer.js src/sets/filter-panel.js src/sets/instructions.js src/sets/instruction-events.js src/menu/instruction-collection.js src/menu/cloud-workshop.js server/instruction-access.js server/http.js src/editor/editor.js src/editor/scene.js src/editor/part-outlines.js src/editor/transmission-map.js src/editor/collision-inspector.js src/editor/collision-panel.js src/editor/drive-estimate-panel.js src/editor/engineering-report.js src/mechanics/drive-estimate.js src/menu/mechanism-inspector.js src/menu/workshop-tools.js src/editor/project-preview.js src/sets/instruction-recognition.js src/sets/instruction-recognition-worker.js src/sets/instruction-pdf.js; do node --check "$f"; done
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
docker run --rm --network "container:$DB" --user 1000:1000 -e PGHOST=127.0.0.1 -e PGPORT=5432 -e PGDATABASE=bricklab_commerce_check -e PGUSER=bricklab_app -e PGPASSWORD="$APPPASS" -e COMMERCE_ADMIN_PASSWORD="$DBPASS" -e BRICKLAB_COMMERCE_INTEGRATION=1 -v "$TMP:/tests" -w /tests bricklab-test-runner:local node --test tests/commerce-upgrades.test.js tests/commerce-yookassa.test.js tests/commerce-unified.test.js tests/commerce-refund-telegram.test.js tests/commerce-live.test.js tests/commerce-receipt-delivery.test.js
if docker image inspect bricklab-npd:3.4.1 >/dev/null 2>&1; then
 docker run --rm --network none --user 1000:1000 --cap-drop ALL --security-opt no-new-privileges --read-only --tmpfs /tmp:rw,mode=1777 -e PYTHONPATH=/app:/npd -v "$TMP/scripts/npd:/npd:ro" --entrypoint python bricklab-npd:3.4.1 /npd/test_operation.py
else
 echo "NPD image missing; build pinned upstream image before running release checks" >&2; exit 1
fi
echo "=== ALL CHECKS PASSED: $SHA ==="
