#!/usr/bin/env python3
"""Reuse the existing root-only BrickLab monitoring bot without printing secrets."""
import json
import os
from pathlib import Path
import re
import shutil
import tempfile
from datetime import datetime

if os.geteuid() != 0:
    raise SystemExit("Run as root on the VPS")
config = Path("/etc/bricklab-backup/telegram.json")
if not config.is_file():
    raise SystemExit("Existing Telegram configuration not found")
data = json.loads(config.read_text(encoding="utf-8"))
token, chat = str(data.get("token", "")), str(data.get("chat_id", ""))
if not re.fullmatch(r"\d{5,15}:[A-Za-z0-9_-]{20,100}", token) or not re.fullmatch(r"-?\d{1,20}", chat):
    raise SystemExit("Invalid Telegram configuration (secret values not printed)")
root = Path(__file__).resolve().parents[1]
env = root / ".env"
if not env.is_file():
    raise SystemExit(".env not found")
backup = Path("/var/backups/bricklab-commerce")
backup.mkdir(mode=0o700, parents=True, exist_ok=True)
backup.chmod(0o700)
dst = backup / ("env-commerce-tg-" + datetime.now().strftime("%Y%m%d-%H%M%S"))
shutil.copyfile(env, dst)
dst.chmod(0o600)
text = env.read_text(encoding="utf-8")
for key, value in {
    "BRICKLAB_COMMERCE_TELEGRAM_ENABLED": "true",
    "BRICKLAB_COMMERCE_TELEGRAM_TOKEN": token,
    "BRICKLAB_COMMERCE_TELEGRAM_CHAT_ID": chat,
}.items():
    text = re.sub(r"(?m)^[ \t]*" + re.escape(key) + r"[ \t]*=.*\n?", "", text)
    text = text.rstrip("\n") + "\n" + key + "=" + value + "\n"
fd, temp = tempfile.mkstemp(prefix=".env-commerce-", dir=root)
try:
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(text)
        f.flush()
        os.fsync(f.fileno())
    os.chmod(temp, 0o600)
    os.replace(temp, env)
finally:
    if os.path.exists(temp):
        os.unlink(temp)
print("Commerce Telegram configured using the existing bot; credentials not printed.")
