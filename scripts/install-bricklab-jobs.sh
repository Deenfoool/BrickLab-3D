#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
cd /opt/bricklab-cloud
test "$(id -u)" = 0
test "$(id -gn bricklab-control)" = bricklab-control
test -f /etc/bricklab-backup/telegram.json
install -m 0644 scripts/bricklab-control-jobs.py /usr/local/lib/bricklab-control/
install -d -m 0700 /var/lib/bricklab-control-jobs
cat >/etc/systemd/system/bricklab-control-jobs.socket <<'UNIT'
[Unit]
Description=BrickLab Control OS restricted job requests
[Socket]
ListenStream=/run/bricklab-control-jobs.sock
SocketUser=root
SocketGroup=bricklab-control
SocketMode=0660
Accept=yes
MaxConnections=2
RemoveOnStop=yes
[Install]
WantedBy=sockets.target
UNIT
cat >/etc/systemd/system/bricklab-control-jobs@.service <<'UNIT'
[Unit]
Description=Validate Control OS job request
[Service]
Type=exec
User=root
UMask=0077
StandardInput=socket
StandardOutput=socket
StandardError=journal
ExecStart=/usr/bin/python3 /usr/local/lib/bricklab-control/bricklab-control-jobs.py broker
RuntimeMaxSec=30
NoNewPrivileges=true
UNIT
cat >/etc/systemd/system/bricklab-control-job.service <<'UNIT'
[Unit]
Description=BrickLab Control OS test or approved release
After=docker.service network-online.target
[Service]
Type=oneshot
User=root
UMask=0077
LoadCredential=telegram.json:/etc/bricklab-backup/telegram.json
Environment=BRICKLAB_MINIAPP_ENABLED=1
ExecStart=/usr/bin/python3 /usr/local/lib/bricklab-control/bricklab-control-jobs.py worker
TimeoutStartSec=45min
NoNewPrivileges=true
PrivateTmp=false
UNIT
systemctl daemon-reload
systemctl enable --now bricklab-control-jobs.socket
echo "Job socket ready; root must explicitly enable writes with control-jobs.enabled."
