#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
cd /opt/bricklab-cloud
test "$(id -u)" = 0
case "${1:-}" in
  ""|--enable-actions) ;;
  *) echo "Usage: $0 [--enable-actions]" >&2; exit 2 ;;
esac
test "$#" -le 1
CONFIG=/etc/bricklab-backup/telegram.json
python3 - "$CONFIG" <<'PY'
import json, os, re, stat, sys
p=sys.argv[1]
s=os.stat(p)
assert s.st_uid == 0 and not stat.S_IMODE(s.st_mode)&0o077
c=json.load(open(p))
assert re.fullmatch(r'[1-9][0-9]{0,18}',str(c.get('chat_id',''))), 'Private owner chat required'
assert re.fullmatch(r'[0-9]+:[A-Za-z0-9_-]{20,}',str(c.get('token','')))
PY
if ! id bricklab-control >/dev/null 2>&1; then
  useradd --system --user-group --no-create-home --shell /usr/sbin/nologin bricklab-control
fi
test "$(id -gn bricklab-control)" = bricklab-control
test "$(id -nG bricklab-control)" = bricklab-control
install -d -m 0755 /usr/local/lib/bricklab-control
install -m 0644 scripts/bricklab-control.py scripts/bricklab-control-snapshot.py scripts/bricklab-control-actions.py /usr/local/lib/bricklab-control/
python3 -m py_compile /usr/local/lib/bricklab-control/*.py
cat >/etc/systemd/system/bricklab-control-snapshot.service <<'UNIT'
[Unit]
Description=BrickLab fixed read-only diagnostic snapshot
After=docker.service network-online.target
[Service]
Type=oneshot
User=root
UMask=0077
RuntimeDirectory=bricklab-control
RuntimeDirectoryMode=0755
RuntimeDirectoryPreserve=yes
ExecStart=/usr/bin/python3 /usr/local/lib/bricklab-control/bricklab-control-snapshot.py
TimeoutStartSec=120
NoNewPrivileges=true
PrivateTmp=true
UNIT
cat >/etc/systemd/system/bricklab-control-snapshot.timer <<'UNIT'
[Unit]
Description=Refresh BrickLab diagnostic snapshot
[Timer]
OnBootSec=15s
OnUnitInactiveSec=60s
AccuracySec=5s
[Install]
WantedBy=timers.target
UNIT
cat >/etc/systemd/system/bricklab-control.service <<'UNIT'
[Unit]
Description=BrickLab private Telegram Control Center
After=network-online.target bricklab-control-snapshot.service
Wants=network-online.target bricklab-control-snapshot.timer
[Service]
Type=simple
User=bricklab-control
Group=bricklab-control
StateDirectory=bricklab-control-bot
LoadCredential=telegram.json:/etc/bricklab-backup/telegram.json
ExecStart=/usr/bin/python3 /usr/local/lib/bricklab-control/bricklab-control.py
Restart=on-failure
RestartSec=10s
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
CapabilityBoundingSet=
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
InaccessiblePaths=-/var/run/docker.sock -/run/docker.sock -/opt/bricklab-cloud -/etc/bricklab-backup
[Install]
WantedBy=multi-user.target
UNIT
cat >/etc/systemd/system/bricklab-control-actions.socket <<'UNIT'
[Unit]
Description=BrickLab fixed privileged actions (opt-in)
[Socket]
ListenStream=/run/bricklab-control-actions.sock
SocketUser=root
SocketGroup=bricklab-control
SocketMode=0660
Accept=yes
MaxConnections=2
RemoveOnStop=yes
[Install]
WantedBy=sockets.target
UNIT
cat >/etc/systemd/system/bricklab-control-actions@.service <<'UNIT'
[Unit]
Description=BrickLab restricted operator action
[Service]
Type=exec
User=root
UMask=0077
StateDirectory=bricklab-control-actions
StateDirectoryMode=0700
StandardInput=socket
StandardOutput=socket
StandardError=journal
ExecStart=/usr/bin/python3 /usr/local/lib/bricklab-control/bricklab-control-actions.py
RuntimeMaxSec=280
NoNewPrivileges=true
PrivateTmp=true
UNIT
systemctl daemon-reload
if [[ "${1:-}" == --enable-actions ]]; then
  systemctl enable --now bricklab-control-actions.socket
else
  systemctl disable --now bricklab-control-actions.socket
fi
systemctl start bricklab-control-snapshot.service
systemctl enable --now bricklab-control-snapshot.timer
systemctl enable --now bricklab-control.service
systemctl restart bricklab-control.service
systemctl status bricklab-control.service --no-pager
