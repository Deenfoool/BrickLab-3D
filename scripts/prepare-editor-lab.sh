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
echo "=== PREPARE CC0 PANORAMAS ==="
install -d -m0755 "$TMP/assets/lab-skies"
for SKY in day sunset night; do
    curl -fLsS --retry 2 --connect-timeout 10 --max-time 90 --max-filesize 12000000 \
      "https://grab3d.com/dl/2d/cozy-sky-$SKY/cozy-sky-${SKY}_4k.png" \
      -o "$TMP/assets/lab-skies/$SKY.png"
done
python3 - "$TMP/assets/lab-skies" <<'PY'
import pathlib,struct,sys
for name in ("day","sunset","night"):
    p=pathlib.Path(sys.argv[1])/(name+".png")
    with p.open("rb") as f: header=f.read(24)
    assert header[:8]==b"\x89PNG\r\n\x1a\n" and header[12:16]==b"IHDR", "Invalid PNG: "+name
    assert struct.unpack(">II",header[16:24])==(4096,2048), "Invalid panorama dimensions: "+name
    assert 1000<p.stat().st_size<=12000000, "Invalid panorama size: "+name
    print(name+": 4096x2048 OK")
PY
cp "$TMP/src/editor/lab-skies-LICENSE.txt" "$TMP/assets/lab-skies/LICENSE.txt"

mv "$TMP" "$DEST"
trap - EXIT
ln -s "releases/$TARGET" "$ROOT/.current-$TARGET"
mv -Tf "$ROOT/.current-$TARGET" "$ROOT/current"
echo "=== STATIC EDITOR LAB STAGED: $TARGET ==="
echo "Root: $ROOT/current"
echo "No nginx, production or database changes made."
