#!/usr/bin/env bash
# Execute only on a separate monitoring host.
set -Eeuo pipefail
umask 077
test "$(id -u)" = 0
test ! -d /opt/bricklab-cloud
test -s /etc/bricklab-external/telegram.json
cd "$(dirname "$0")"
install -m 0700 bricklab-control-external.py /usr/local/sbin/bricklab-control-external
cat >/etc/systemd/system/bricklab-external.service <<'UNIT'
[Unit]
Description=Independent BrickLab HTTPS monitor
After=network-online.target
[Service]
Type=oneshot
User=root
StateDirectory=bricklab-external
StateDirectoryMode=0700
UMask=0077
ExecStart=/usr/bin/python3 /usr/local/sbin/bricklab-control-external
TimeoutStartSec=35
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
UNIT
cat >/etc/systemd/system/bricklab-external.timer <<'UNIT'
[Unit]
Description=Check BrickLab independently
[Timer]
OnBootSec=30s
OnUnitInactiveSec=60s
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now bricklab-external.timer
