#!/usr/bin/env bash
set -euo pipefail
test "$(id -u)" = 0
cd /opt/bricklab-cloud
test -f /etc/bricklab-backup/telegram.json
install -d -m 0755 /usr/local/lib/bricklab-control
install -m 0644 scripts/bricklab-control-upkeep.py /usr/local/lib/bricklab-control/
install -d -m 0700 /var/lib/bricklab-control-upkeep
cat >/etc/systemd/system/bricklab-control-upkeep-sample.service <<'UNIT'
[Unit]
Description=BrickLab upkeep metrics and disk notifications
After=docker.service network-online.target
Wants=network-online.target
[Service]
Type=oneshot
User=root
UMask=0077
LoadCredential=telegram.json:/etc/bricklab-backup/telegram.json
ExecStart=/usr/bin/python3 /usr/local/lib/bricklab-control/bricklab-control-upkeep.py sample
TimeoutStartSec=180
NoNewPrivileges=true
UNIT
cat >/etc/systemd/system/bricklab-control-upkeep-sample.timer <<'UNIT'
[Unit]
Description=Sample BrickLab infrastructure every five minutes
[Timer]
OnCalendar=*:0/5
Persistent=true
[Install]
WantedBy=timers.target
UNIT
cat >/etc/systemd/system/bricklab-control-upkeep-cleanup.service <<'UNIT'
[Unit]
Description=BrickLab protected Docker cache and rollback retention
After=docker.service
[Service]
Type=oneshot
User=root
UMask=0077
ExecStart=/usr/bin/python3 /usr/local/lib/bricklab-control/bricklab-control-upkeep.py cleanup
TimeoutStartSec=900
NoNewPrivileges=true
UNIT
cat >/etc/systemd/system/bricklab-control-upkeep-cleanup.timer <<'UNIT'
[Unit]
Description=BrickLab daily upkeep at 04:00 Moscow time
[Timer]
OnCalendar=*-*-* 04:00:00 Europe/Moscow
Persistent=true
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now bricklab-control-upkeep-sample.timer bricklab-control-upkeep-cleanup.timer
systemctl start bricklab-control-upkeep-sample.service
echo "Upkeep installed. Cleanup previews only unless /etc/bricklab-backup/upkeep-cleanup.enabled exists."
