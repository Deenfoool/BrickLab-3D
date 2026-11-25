#!/usr/bin/env bash
# One-time installation. The timer then handles refreshes without manual work.
set -euo pipefail
cd /opt/bricklab-cloud
test "$(id -u)" = 0
if ! id bricklab-catalog >/dev/null 2>&1; then
  useradd --system --user-group --no-create-home --shell /usr/sbin/nologin bricklab-catalog
fi
install -d -o root -g root -m 0755 /var/lib/bricklab-catalog
install -d -o bricklab-catalog -g bricklab-catalog -m 0750 /var/lib/bricklab-catalog/cache
install -d -o bricklab-catalog -g bricklab-catalog -m 0755 /var/lib/bricklab-catalog/public
if [[ ! -f /var/lib/bricklab-catalog/public/aliases.json ]]; then
  install -o bricklab-catalog -g bricklab-catalog -m 0644 catalog/resolver/aliases.json /var/lib/bricklab-catalog/public/aliases.json
fi
install -d -m 0755 /usr/local/libexec
install -m 0755 scripts/refresh-part-index.py /usr/local/libexec/bricklab-catalog-refresh
install -m 0700 scripts/report-part-index.py /usr/local/libexec/bricklab-catalog-report
cat >/etc/systemd/system/bricklab-catalog-refresh.service <<'UNIT'
[Unit]
Description=BrickLab verified part catalog refresh
Wants=network-online.target
After=network-online.target
OnSuccess=bricklab-catalog-report.service
OnFailure=bricklab-catalog-report.service

[Service]
Type=oneshot
User=bricklab-catalog
Group=bricklab-catalog
ExecStart=/usr/bin/python3 /usr/local/libexec/bricklab-catalog-refresh --catalog /opt/bricklab-cloud/catalog/parts-library.json --state /var/lib/bricklab-catalog
NoNewPrivileges=yes
PrivateTmp=yes
ProtectHome=yes
ProtectSystem=strict
ReadWritePaths=/var/lib/bricklab-catalog/cache /var/lib/bricklab-catalog/public
UMask=0022
MemoryMax=768M
CPUQuota=60%
Nice=10
TimeoutStartSec=20min
UNIT
cat >/etc/systemd/system/bricklab-catalog-refresh.timer <<'UNIT'
[Unit]
Description=Daily BrickLab catalog synchronization

[Timer]
OnCalendar=*-*-* 03:15:00
RandomizedDelaySec=20min
Persistent=true
Unit=bricklab-catalog-refresh.service

[Install]
WantedBy=timers.target
UNIT
cat >/etc/systemd/system/bricklab-catalog-report.service <<'UNIT'
[Unit]
Description=Report BrickLab catalog synchronization to existing Telegram monitor

[Service]
Type=oneshot
ExecStart=/usr/bin/python3 /usr/local/libexec/bricklab-catalog-report
NoNewPrivileges=yes
PrivateTmp=yes
ProtectHome=yes
ProtectSystem=strict
TimeoutStartSec=30
UNIT
systemctl daemon-reload
systemctl enable --now bricklab-catalog-refresh.timer
systemctl start --no-block bricklab-catalog-refresh.service
systemctl list-timers bricklab-catalog-refresh.timer --no-pager
