#!/usr/bin/env python3
"""Optional Telegram report. Credentials never enter the catalog worker or public index."""
import json
import os
from pathlib import Path
import re
import stat
import subprocess
from urllib.request import Request, urlopen

CONFIG = Path("/etc/bricklab-backup/telegram.json")
INDEX = Path("/var/lib/bricklab-catalog/public/aliases.json")

def report():
    if not CONFIG.is_file():
        print("Catalog Telegram report skipped: monitor is not configured")
        return
    with CONFIG.open() as source:
        info = os.fstat(source.fileno())
        if info.st_uid != 0 or stat.S_IMODE(info.st_mode) & 0o077:
            raise ValueError("unsafe config")
        config = json.load(source)
    token, chat = str(config.get("token", "")), str(config.get("chat_id", ""))
    if not re.fullmatch(r"\d+:[A-Za-z0-9_-]{20,}", token) or not re.fullmatch(r"-?\d+", chat):
        raise ValueError("invalid config")
    result = subprocess.run(["systemctl", "show", "-p", "Result", "--value",
                             "bricklab-catalog-refresh.service"], capture_output=True,
                            text=True, timeout=5, check=True).stdout.strip()
    if result == "success":
        fd = os.open(INDEX, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(fd, "rb") as source:
            info = os.fstat(source.fileno())
            if not stat.S_ISREG(info.st_mode) or info.st_size > 4_000_000:
                raise ValueError("invalid index")
            index = json.loads(source.read(4_000_001))
        stats = index["stats"]
        message = ("📦 BrickLab — каталог обновлён\n"
                   f"Моделей в библиотеке: {int(stats['catalogModels'])}\n"
                   f"Подтверждённых алиасов: {int(stats['resolvedAliases'])}\n"
                   f"Новых соответствий: {int(stats.get('newAliases', 0))}\n"
                   f"Алиасов без модели: {int(stats['unresolvedAliases'])}")
        if index.get("elementRefreshError"):
            message += "\n⚠ Rebrickable недоступен; прежний индекс сохранён."
    else:
        message = "⚠ BrickLab — обновление каталога не завершилось. Последний корректный индекс сохранён."
    body = json.dumps({"chat_id": chat, "text": message, "disable_notification": True}).encode()
    req = Request("https://api.telegram.org/bot" + token + "/sendMessage", data=body,
                  headers={"Content-Type": "application/json"}, method="POST")
    with urlopen(req, timeout=12) as response:
        if json.load(response).get("ok") is not True:
            raise ValueError("telegram rejected")
    print("Catalog Telegram report delivered")

if __name__ == "__main__":
    try:
        report()
    except Exception:
        # Do not log a URL or exception body containing the bot token.
        raise SystemExit("Catalog Telegram report failed")
