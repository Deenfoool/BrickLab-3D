#!/usr/bin/env bash
# Independent authorization, run manually by root over SSH.
set -Eeuo pipefail
umask 077
test "$(id -u)" = 0
sha="$(printf '%s' "${1:?Exact reviewed SHA required}")"
[[ "$sha" =~ ^[0-9a-f]{40}$ ]]
cd /opt/bricklab-cloud
test "$(git rev-parse refs/remotes/origin/feature/cloud-migration)" = "$sha"
git merge-base --is-ancestor HEAD "$sha"
dir=/etc/bricklab-backup
test "$(stat -c %u "$dir")" = 0
tmp="$(mktemp "$dir/control-release.approved.XXXXXX")"
trap 'rm -f -- "$tmp"' EXIT
printf '%s %s\n' "$sha" "$(( $(date +%s)+3600 ))" > "$tmp"
chmod 0600 "$tmp"
mv -T "$tmp" "$dir/control-release.approved"
printf 'Approved for one release attempt within one hour: %s\n' "$sha"
