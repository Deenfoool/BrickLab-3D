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
    owner=int(json.load(f)['chat_id'])
    assert owner>0, 'Private owner required'
PY
# App container already mounts this private directory read-only.
test -d /var/lib/bricklab-commerce-private
# Refuse to alter permissions of the existing private directory.
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
install -m 0644 scripts/bricklab-hub-campaign-worker.py /usr/local/lib/bricklab-control/
cat >/etc/systemd/system/bricklab-hub-campaign.service <<'UNIT'
[Unit]
Description=BrickLab opt-in Telegram campaign delivery
After=network-online.target
[Service]
Type=oneshot
User=bricklab-control
Group=bricklab-control
LoadCredential=telegram.json:/etc/bricklab-backup/telegram.json
LoadCredential=hub.key:/etc/bricklab-backup/hub.key
ExecStart=/usr/bin/python3 /usr/local/lib/bricklab-control/bricklab-hub-campaign-worker.py
TimeoutStartSec=6min
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
CapabilityBoundingSet=
InaccessiblePaths=-/run/docker.sock -/var/run/docker.sock -/opt/bricklab-cloud -/etc/bricklab-backup -/run/bricklab-control-actions.sock -/run/bricklab-control-jobs.sock
UNIT
cat >/etc/systemd/system/bricklab-hub-campaign.timer <<'UNIT'
[Unit]
Description=Deliver approved opt-in campaigns
[Timer]
OnBootSec=2min
OnUnitInactiveSec=60s
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
echo 'Campaign timer is opt-in: enable only after testing.'
echo 'Hub credentials provisioned. Deploy updated application with migration, then restart control and miniapp services.'
