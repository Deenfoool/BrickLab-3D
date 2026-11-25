#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
cd /opt/bricklab-cloud
test "$(id -u)" = 0
test -s /etc/bricklab-backup/telegram.json
install -m 0750 scripts/bricklab-events.py /usr/local/sbin/bricklab-events
python3 -m py_compile /usr/local/sbin/bricklab-events
cat >/etc/systemd/system/bricklab-events.service <<'UNIT'
[Unit]
Description=BrickLab durable Telegram events
After=docker.service network-online.target
Wants=network-online.target
[Service]
Type=oneshot
User=root
UMask=0077
ExecStart=/usr/bin/python3 /usr/local/sbin/bricklab-events
TimeoutStartSec=300
NoNewPrivileges=true
PrivateTmp=true
UNIT
cat >/etc/systemd/system/bricklab-events.timer <<'UNIT'
[Unit]
Description=Deliver BrickLab administrative events every minute
[Timer]
OnBootSec=45s
OnUnitInactiveSec=60s
AccuracySec=5s
Unit=bricklab-events.service
[Install]
WantedBy=timers.target
UNIT
# Verify the database migration, credentials and connectivity before enabling the new timer.
/usr/bin/python3 /usr/local/sbin/bricklab-events --status
# Existing monitoring timer remains unchanged.
 /usr/bin/python3 /usr/local/sbin/bricklab-events --test
systemctl daemon-reload
systemctl enable --now bricklab-events.timer
systemctl list-timers bricklab-events.timer --no-pager
