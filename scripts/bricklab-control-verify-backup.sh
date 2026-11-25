#!/usr/bin/env bash
# Restore a root-selected PostgreSQL custom-format backup into an isolated disposable DB.
set -Eeuo pipefail
umask 077
test "$(id -u)" = 0
dump="$(realpath -- "${1:?Path to local pg_dump custom-format archive required}")"
test -f "$dump"
test "$(stat -c %u "$dump")" = 0
mode="$(stat -c %a "$dump")"
(( (8#$mode & 077) == 0 ))
# Never reuse a live service/container/volume.
name="bricklab-restore-check-$(openssl rand -hex 8)"
state=/var/lib/bricklab-control-verification
install -d -m 0700 "$state"
exec 9>>/run/bricklab-deploy.lock
flock -n 9 || { echo 'Another operation is active' >&2; exit 1; }
write_result(){
  local tmp
  tmp="$(mktemp "$state/.result.XXXXXX")"
  printf '%s %s\n' "$(date +%s)" "$1" > "$tmp"
  mv -T "$tmp" "$state/result"
}
created=0
success=0
cleanup(){
  local rc=$?
  if (( created )); then docker rm -fv "$name" >/dev/null 2>&1 || true; fi
  if (( success )); then write_result ok; else write_result failed; fi
  exit "$rc"
}
trap cleanup EXIT
write_result running
docker image inspect postgres:16 >/dev/null
# No external network, no bind mount or production data directory.
docker run -d --name "$name" --network none --memory=768m --cpus=1 \
  -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=restore_check \
  postgres:16 >/dev/null
created=1
ready=0
for _ in $(seq 1 60); do
  if docker exec "$name" pg_isready -h 127.0.0.1 -U postgres -d restore_check >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
test "$ready" = 1
# Copy via stdin. Output is deliberately not exported to Telegram.
docker exec -i "$name" pg_restore --exit-on-error --no-owner --no-privileges -U postgres -d restore_check < "$dump"
docker exec "$name" psql -X -v ON_ERROR_STOP=1 -U postgres -d restore_check \
  -c 'SELECT count(*) FROM bricklab.users' \
  -c 'SELECT count(*) FROM bricklab.public_builds' >/dev/null
success=1
echo 'Disposable PostgreSQL restore and schema checks passed.'
