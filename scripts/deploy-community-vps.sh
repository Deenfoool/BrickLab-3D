#!/usr/bin/env bash
# Execute on the BrickLab VPS as root, with the exact tested commit argument.
set -Eeuo pipefail
if [[ ! -f "${BASH_SOURCE[0]}" ]]; then echo 'Run a saved script file, not bash -s' >&2; exit 2; fi
exec </dev/null
umask 077
cd /opt/bricklab-cloud
# Shared with the Telegram action broker; keep fd open throughout this release.
exec 9>>/run/bricklab-deploy.lock
flock -n 9 || { echo "Another BrickLab operation is running" >&2; exit 1; }
TARGET="${1:?Supply an exact release commit SHA}"
[[ "$TARGET" =~ ^[0-9a-f]{40}$ ]]
test "$(git branch --show-current)" = feature/cloud-migration
git diff --quiet
git diff --cached --quiet
test "$(git rev-parse origin/feature/cloud-migration)" = "$TARGET"
git merge-base --is-ancestor HEAD "$TARGET"
docker compose config --quiet
docker image inspect bricklab-test-runner:local >/dev/null
docker image inspect postgres:16 >/dev/null

TMP=$(mktemp -d /tmp/bricklab-hub-tests-XXXXXX)
NET="bricklab-release-test-$$"
DB="bricklab-release-db-$$"
cleanup(){
    docker rm -f "$DB" >/dev/null 2>&1 || true
    docker network rm "$NET" >/dev/null 2>&1 || true
    rm -rf -- "$TMP"
}
trap cleanup EXIT
git archive "$TARGET" | tar -x -C "$TMP"
chown -R 1000:1000 "$TMP"
chmod 755 "$TMP"

echo "=== UNIT AND HTTP TESTS ==="
docker run --rm --network bridge --memory=1536m --cpus=1 \
    -e npm_config_cache=/tmp/npm-cache -v "$TMP:/tests" -w /tests \
    bricklab-test-runner:local npm ci --include=dev --ignore-scripts --no-audit --no-fund
docker run --rm --network none --memory=1536m --cpus=1 \
    -e BRICKLAB_TEST_IMAGE=true -v "$TMP:/tests" -w /tests \
    bricklab-test-runner:local npm test -- --test-concurrency=1 \
    2>&1 | tee /tmp/bricklab-hub-tests.log

echo "=== TELEGRAM WORKER TESTS ==="
docker run --rm --network none --memory=256m --cpus=1 -v "$TMP:/tests:ro" -w /tests bricklab-test-runner:local python3 -B tests/telegram_events_test.py
docker run --rm --network none --memory=256m --cpus=1 -v "$TMP:/tests:ro" -w /tests bricklab-test-runner:local python3 -B tests/telegram_control_test.py
docker run --rm --network none --memory=256m --cpus=1 -v "$TMP:/tests:ro" -w /tests bricklab-test-runner:local python3 -B tests/telegram_control_actions_test.py
docker run --rm --network none --memory=256m --cpus=1 -v "$TMP:/tests:ro" -w /tests bricklab-test-runner:local python3 -B tests/telegram_control_automation_test.py
docker run --rm --network none --memory=256m --cpus=1 -v "$TMP:/tests:ro" -w /tests bricklab-test-runner:local python3 -B tests/telegram_control_recovery_test.py

echo "=== ISOLATED DATABASE TESTS ==="
export POSTGRES_PASSWORD="$(openssl rand -hex 32)"
export BRICKLAB_APP_PASSWORD="$(openssl rand -hex 32)"
docker network create --internal "$NET" >/dev/null
docker run -d --rm --name "$DB" --network "$NET" \
    -e POSTGRES_DB=bricklab_browser_test -e POSTGRES_USER=bricklab_admin \
    -e POSTGRES_PASSWORD postgres:16 >/dev/null
ready=false
for i in $(seq 1 60); do
    if docker exec "$DB" pg_isready -h 127.0.0.1 -U bricklab_admin -d bricklab_browser_test >/dev/null 2>&1; then
        ready=true; break
    fi
    sleep 1
done
test "$ready" = true
PGPASSWORD="$POSTGRES_PASSWORD" docker run --rm --network "$NET" \
    -e PGHOST="$DB" -e PGDATABASE=bricklab_browser_test -e PGUSER=bricklab_admin \
    -e PGPASSWORD -e BRICKLAB_APP_PASSWORD -v "$TMP/server/db:/migrations:ro" \
    postgres:16 sh /migrations/setup.sh
for check in account_security.sql community_options.sql store_orders.sql notification_events.sql unified_profile.sql; do
    docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" "$DB" \
      psql -X -v ON_ERROR_STOP=1 -U bricklab_admin -d bricklab_browser_test \
      < "$TMP/server/db/tests/$check"
done
# Seed an administrator only in the disposable database for role-based cosmetic tests.
BRICKLAB_TEST_ADMIN_ID=$(docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$DB" psql -X -qAt -v ON_ERROR_STOP=1 -U bricklab_admin -d bricklab_browser_test -c "WITH u AS (INSERT INTO bricklab.users(email,display_name,password_hash) VALUES ('theme-admin-'||gen_random_uuid()||'@example.invalid','Theme test administrator','test-hash') RETURNING id), a AS (INSERT INTO bricklab.admin_accounts(user_id) SELECT id FROM u RETURNING user_id) SELECT user_id FROM a;")
[[ "$BRICKLAB_TEST_ADMIN_ID" =~ ^[0-9a-f-]{36}$ ]]
export BRICKLAB_TEST_ADMIN_ID
PGPASSWORD="$BRICKLAB_APP_PASSWORD" docker run --rm --network "$NET" \
    --memory=1536m --cpus=1 -e PGHOST="$DB" -e PGDATABASE=bricklab_browser_test \
    -e PGUSER=bricklab_app -e PGPASSWORD -e BRICKLAB_TEST_DB=true -e BRICKLAB_TEST_ADMIN_ID \
    -v "$TMP:/tests" -w /tests bricklab-test-runner:local \
    node --test --test-concurrency=1 tests/server-auth.test.js tests/community-db.test.js
unset POSTGRES_PASSWORD BRICKLAB_APP_PASSWORD BRICKLAB_TEST_ADMIN_ID
docker rm -f "$DB" >/dev/null
docker network rm "$NET" >/dev/null

echo "=== PRODUCTION BACKUPS ==="
systemctl start bricklab-backup.service
systemctl start bricklab-config-backup.service
OLD=$(git rev-parse HEAD)
CID=$(docker compose ps -q bricklab)
test -n "$CID"
IMAGE=$(docker inspect -f '{{.Image}}' "$CID")
NAME=$(docker inspect -f '{{.Config.Image}}' "$CID")
docker tag "$IMAGE" "bricklab-cloud-bricklab:rollback-${OLD:0:7}"
phase=build
failed(){
    local rc=$?
    trap - ERR
    set +e
    if [[ "$phase" == build ]]; then
        git reset --keep "$OLD"
        docker tag "$IMAGE" "$NAME"
        echo "Build failed; existing production container was not stopped." >&2
    else
        # The previous server does not enforce the new publication permissions.
        # Never expose it once migration/deployment has begun.
        docker compose stop bricklab
        echo "Deployment failed; application stopped to protect permissions. Database was not restored or deleted." >&2
        echo "Inspect docker compose logs --tail=100 bricklab and the migration output." >&2
    fi
    exit "$rc"
}
trap failed ERR
echo "=== BUILD RELEASE ==="
git merge --ff-only "$TARGET"
docker compose build bricklab
phase=migrate
echo "=== APPLY MIGRATION ==="
docker compose stop bricklab
docker compose run -T --rm --no-deps migrate
phase=deploy
echo "=== START RELEASE ==="
docker compose up -d --no-deps --no-build --wait --wait-timeout 120 bricklab
curl -fsS http://127.0.0.1:8080/api/health
curl -fsS https://bricklab-3d.ru/api/health
curl -fsS https://bricklab-3d.ru/ | grep -F 'unified-profile.css?v=unified-1' >/dev/null
curl -fsS 'https://bricklab-3d.ru/api/community/builds?sort=popular&week=1' >/dev/null
trap - ERR
echo
echo "BRICKLAB HUB AND COMMUNITY 2.0 UPDATED"
git log -1 --oneline
