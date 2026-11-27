#!/usr/bin/env bash
# Runs only an exact, independently approved commit. No automatic rollback after migration.
set -Eeuo pipefail
umask 077
cd /opt/bricklab-cloud
approval=/etc/bricklab-backup/control-release.approved
# Atomic consume before any side effect. The root-only directory must not be writable by the bot.
test -f "$approval"
test ! -L "$approval"
test "$(stat -c '%u:%a' "$approval")" = 0:600
used="$(mktemp /etc/bricklab-backup/control-release.used.XXXXXX)"
trap 'rm -f -- "$used"' EXIT
mv -T -- "$approval" "$used"
read -r target expires extra < "$used"
[[ "$target" =~ ^[0-9a-f]{40}$ && "$expires" =~ ^[0-9]{1,12}$ && -z "$extra" ]]
(( expires >= $(date +%s) && expires <= $(date +%s)+86400 ))
# A queued Mini App release is bound to the exact SHA it tested.
if [[ $# -gt 0 ]]; then
    test "$#" = 1
    test "$target" = "$1"
fi
test "$(git branch --show-current)" = feature/cloud-migration
git diff --quiet
git diff --cached --quiet
git fetch origin feature/cloud-migration
test "$(git rev-parse refs/remotes/origin/feature/cloud-migration)" = "$target"
git merge-base --is-ancestor HEAD "$target"
# Run the installed release runner, not arbitrary code from an unapproved ref.
test -f /usr/local/lib/bricklab-control/deploy-community-vps.sh
bash /usr/local/lib/bricklab-control/deploy-community-vps.sh "$target"
