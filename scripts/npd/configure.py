#!/usr/bin/env python3
"""Install a disabled-by-default local worker; only root may operate it.
No credentials are collected in preparation mode. Enable only after contract,
legal approval and a verified plan for individual-buyer receipts.
"""
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
from datetime import datetime, timezone
from getpass import getpass

ROOT = Path(__file__).resolve().parents[2]
PRIVATE = Path("/etc/bricklab-npd")
SETTINGS = PRIVATE / "settings.json"

def save(data):
    PRIVATE.mkdir(mode=0o700, exist_ok=True)
    PRIVATE.chmod(0o700)
    temp = PRIVATE / (".settings-" + secrets.token_hex(8))
    fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(data, f)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temp, SETTINGS)
    finally:
        temp.unlink(missing_ok=True)

def install():
    if ROOT != Path("/opt/bricklab-cloud"):
        raise SystemExit("Run from /opt/bricklab-cloud")
    subprocess.run(["docker", "image", "inspect", "bricklab-npd:3.4.1"], check=True, stdout=subprocess.DEVNULL)
    if not SETTINGS.exists():
        save({"enabled": False})
    service = """[Unit]
Description=BrickLab NPD receipt worker
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
User=root
WorkingDirectory=/opt/bricklab-cloud
ExecStart=/usr/bin/python3 /opt/bricklab-cloud/scripts/npd/worker.py
TimeoutStartSec=240
UMask=0077
"""
    timer = """[Unit]
Description=Check BrickLab fiscal queue

[Timer]
OnBootSec=30s
OnUnitInactiveSec=15s
AccuracySec=1s
Unit=bricklab-npd.service

[Install]
WantedBy=timers.target
"""
    Path("/etc/systemd/system/bricklab-npd.service").write_text(service)
    Path("/etc/systemd/system/bricklab-npd.timer").write_text(timer)
    subprocess.run(["systemctl", "daemon-reload"], check=True)
    print("NPD worker installed; no timer started and no FNS credentials requested.")

def enable():
    if not Path("/etc/systemd/system/bricklab-npd.service").exists():
        raise SystemExit("Run prepare first")
    env = (ROOT / ".env").read_text()
    def has(key, pattern):
        return re.search(r"(?m)^" + key + "=" + pattern + r"$", env)
    if not has("BRICKLAB_YOOKASSA_LIVE_SHOP_ID", r"[0-9]{1,20}") or not has("BRICKLAB_YOOKASSA_LIVE_SECRET", r"live_[A-Za-z0-9_*-]{11,}"):
        raise SystemExit("Live YooKassa credentials required; do not use test keys.")
    if input("Подтверди: только физлица, договор и правовой режим проверены, отдельный синхронизатор остановлен. Введи ПОДТВЕРЖДАЮ: ") != "ПОДТВЕРЖДАЮ":
        raise SystemExit("Cancelled")
    inn = input("ИНН: ").strip()
    password = getpass("Пароль личного кабинета ФНС: ")
    if not re.fullmatch(r"[0-9]{12}", inn) or not password:
        raise SystemExit("Invalid credentials")
    # Reuse the previous cutoff on reconfiguration, otherwise require an
    # explicit date to avoid silently fiscalizing historical payments.
    old = json.loads(SETTINGS.read_text()) if SETTINGS.exists() else {}
    since = old.get("since") or input("Дата начала автоматизации (ISO 8601 с часовым поясом): ").strip()
    if datetime.fromisoformat(since).tzinfo is None:
        raise SystemExit("Timezone required")
    save({"enabled": True, "individual_buyers_only": True, "since": since,
          "inn": inn, "password": password})
    subprocess.run(["systemctl", "enable", "--now", "bricklab-npd.timer"], check=True)
    print("NPD worker enabled. Check the queue and perform controlled real receipt acceptance.")

if __name__ == "__main__":
    if os.geteuid() != 0:
        raise SystemExit("Run as root")
    if sys.argv[1:] == ["prepare"]:
        install()
    elif sys.argv[1:] == ["enable"]:
        enable()
    elif sys.argv[1:] == ["disable"]:
        subprocess.run(["systemctl", "disable", "--now", "bricklab-npd.timer"], check=True)
        # Allow any running fiscal request to finish; do not kill it mid-write.
        data = json.loads(SETTINGS.read_text()) if SETTINGS.exists() else {}
        data["enabled"] = False
        save(data)
        print("NPD timer disabled. Existing tax obligations must be fulfilled manually.")
    else:
        raise SystemExit("Usage: configure.py prepare|enable|disable")
