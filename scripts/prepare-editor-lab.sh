#!/usr/bin/env bash
# Stage a static editor release; never change production checkout or nginx.
set -Eeuo pipefail
umask 022
cd /opt/bricklab-cloud
TARGET="${1:?Exact tested SHA required}"
[[ "$TARGET" =~ ^[0-9a-f]{40}$ ]]
git fetch --no-tags origin refs/heads/feature/editor-lab
test "$(git rev-parse FETCH_HEAD)" = "$TARGET"
ROOT=/var/www/bricklab-editor-lab
install -d -m0755 "$ROOT/releases"
exec 9>>/run/bricklab-editor-lab.lock
flock -n 9
DEST="$ROOT/releases/$TARGET"
test ! -e "$DEST"
TMP=$(mktemp -d "$ROOT/releases/.stage-XXXXXX")
trap 'rm -rf -- "$TMP"' EXIT
git archive "$TARGET" editor-lab.html src assets catalog vendor examples | tar -x -C "$TMP"
mv "$TMP/editor-lab.html" "$TMP/index.html"
chmod 755 "$TMP"
# Reject links, which could expose files beyond the static release.
test -z "$(find "$TMP" -type l -print -quit)"
test -f "$TMP/src/editor/lab.js"
test -f "$TMP/vendor/three/build/three.module.min.js"
mv "$TMP" "$DEST"
trap - EXIT
ln -s "releases/$TARGET" "$ROOT/.current-$TARGET"
mv -Tf "$ROOT/.current-$TARGET" "$ROOT/current"
echo "=== STATIC EDITOR LAB STAGED: $TARGET ==="
echo "Root: $ROOT/current"
echo "No nginx, production or database changes made."
