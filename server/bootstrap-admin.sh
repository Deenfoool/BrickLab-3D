#!/bin/bash
# Run manually as root on the VPS; never pass passwords on the command line.
set -euo pipefail
umask 077
if [[ $EUID -ne 0 || $(hostname -s) != box-1011397 ]]; then echo "Run as root on BrickLab VPS"; exit 1; fi
cd /opt/bricklab-cloud
read -r -p "Administrator email: " email </dev/tty
email=${email,,}
if [[ ! "$email" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ || ${#email} -gt 254 ]]; then echo "Invalid email"; exit 1; fi
read -r -p "Administrator display name [Administrator]: " name </dev/tty
name=${name:-Administrator}
if [[ ${#name} -gt 80 ]]; then echo "Name too long"; exit 1; fi
read -r -s -p "Administrator password (at least 16 characters): " pass </dev/tty; echo
read -r -s -p "Repeat password: " again </dev/tty; echo
if [[ "$pass" != "$again" || ${#pass} -lt 16 || ${#pass} -gt 256 ]]; then echo "Password mismatch or invalid length"; exit 1; fi
hash=$(printf '%s' "$pass" | docker compose exec -T bricklab node --input-type=module -e 'import {hashPassword} from "./server/auth.js";let s="";for await(const c of process.stdin)s+=c;process.stdout.write(await hashPassword(s))')
unset pass again
if [[ ! "$hash" =~ ^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$ ]]; then echo "Password hashing failed"; exit 1; fi
docker compose exec -T -e BOOT_EMAIL="$email" -e BOOT_NAME="$name" -e BOOT_HASH="$hash" db psql -X -v ON_ERROR_STOP=1 -U bricklab_admin -d bricklab <<'SQL'
\getenv email BOOT_EMAIL
\getenv name BOOT_NAME
\getenv hash BOOT_HASH
BEGIN;
WITH created AS (
 INSERT INTO bricklab.users(email,display_name,password_hash) VALUES (:'email',:'name',:'hash') RETURNING id
)
INSERT INTO bricklab.admin_accounts(user_id) SELECT id FROM created;
COMMIT;
SQL
unset hash
echo "Administrator created. Sign in at https://bricklab-3d.ru/#account"
