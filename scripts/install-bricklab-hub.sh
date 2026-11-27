#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
cd /opt/bricklab-cloud
test "$(id -u)" = 0
test -f .env
test ! -L .env
python3 - <<'PY'
import json
with open('/etc/bricklab-backup/telegram.json') as f:
    assert int(json.load(f)['chat_id'])>0, 'Private owner required'
PY
# App container already mounts this private directory read-only.
test -d /var/lib/bricklab-commerce-private
KEY=/var/lib/bricklab-commerce-private/hub.key
if [[ ! -e "$KEY" ]]; then openssl rand -hex 32 > "$KEY"; fi
test ! -L "$KEY"
test "$(stat -c %u "$KEY")" = 0
chown root:1000 "$KEY"
chmod 0440 "$KEY"
install -m 0600 "$KEY" /etc/bricklab-backup/hub.key
python3 - <<'PY'
from pathlib import Path
p=Path('.env')
s=p.read_text()
import json
with open('/etc/bricklab-backup/telegram.json') as f:
    owner=int(json.load(f)['chat_id'])
for line in ('BRICKLAB_HUB_KEY_FILE=/app/private-commerce/hub.key',f'BRICKLAB_HUB_OWNER_ID={owner}'):
    matches=[x for x in s.splitlines() if x.startswith(line.split('=',1)[0]+'=')]
    assert not matches or matches==[line], 'Unexpected Hub key configuration'
    if not matches:
        with p.open('a') as f:f.write('\n'+line+'\n')
PY
install -d -m 0755 /etc/systemd/system/bricklab-control-miniapp.service.d /etc/systemd/system/bricklab-control.service.d
printf '[Service]\nLoadCredential=hub.key:/etc/bricklab-backup/hub.key\n' >/etc/systemd/system/bricklab-control-miniapp.service.d/30-hub.conf
printf '[Service]\nEnvironment=BRICKLAB_HUB_ENABLED=1\n' >/etc/systemd/system/bricklab-control.service.d/30-hub.conf
systemctl daemon-reload
echo 'Hub credentials provisioned. Deploy updated application with migration, then restart control and miniapp services.'
