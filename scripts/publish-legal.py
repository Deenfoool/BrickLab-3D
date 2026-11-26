#!/usr/bin/env python3
"""Render and publish reviewed legal documents on the VPS, not in Git."""
import argparse
from datetime import datetime, timezone
import hashlib
import html
import json
import os
from pathlib import Path
import re
import shutil
import tempfile

ROOT = Path(__file__).resolve().parents[1]
LEGAL = Path("/var/lib/bricklab-legal")
PRIVATE = Path("/var/lib/bricklab-commerce-private")
REVIEW = PRIVATE / "review"
NAMES = ("offer", "privacy", "refund", "requisites")
ENV = ROOT / ".env"

def atomic(path, data, mode=0o644):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(dir=path.parent, prefix=".legal-")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        os.chmod(temp, mode)
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)

def ask(label):
    value = input(label + ": ").strip()
    if not value or len(value) > 1000 or "{{" in value or "}}" in value:
        raise SystemExit("Укажите проверенное значение, без шаблонов.")
    return html.escape(value)

def prepare():
    if not (LEGAL / "requisites.html").is_file():
        raise SystemExit("Сначала разместите реквизиты.")
    PRIVATE.mkdir(mode=0o755, parents=True, exist_ok=True)
    REVIEW.mkdir(mode=0o700, exist_ok=True)
    REVIEW.chmod(0o700)
    values = {"EFFECTIVE_DATE": datetime.now().strftime("%d.%m.%Y")}
    for key, label in [
        ("HOSTING", "Провайдер VPS, страна/регион размещения базы"),
        ("OTHER_PROCESSORS", "Фактические сервисы поддержки, уведомлений и другие получатели"),
        ("LOCALIZATION", "Подтвержденные условия локализации и трансграничной передачи"),
        ("LOG_RETENTION", "Фактический срок хранения журналов"),
        ("BACKUP_RETENTION", "Фактический срок хранения резервных копий"),
        ("SUPPORT_RETENTION", "Установленный срок хранения обращений"),
    ]:
        values[key] = ask(label)
    for name in NAMES:
        if name == "requisites":
            text = (LEGAL / "requisites.html").read_text(encoding="utf-8")
            if 'id="postal-address"' not in text:
                raise SystemExit("Сначала добавьте почтовый адрес в реквизиты.")
        else:
            text = (ROOT / "docs/legal-release" / (name + ".html")).read_text(encoding="utf-8")
            for key, value in values.items():
                text = text.replace("{{" + key + "}}", value)
        if re.search(r"\{\{[A-Z_]+\}\}", text):
            raise SystemExit("Не заполнены поля документа: " + name)
        atomic(REVIEW / (name + ".html"), text.encode(), 0o600)
    print("Документы подготовлены для проверки:", REVIEW)
    print("Публикация и включение платежей не выполнены.")

def prepare_catalog():
    # Preserve the already-approved privacy/requisites, including VPS-only data.
    manifest = json.loads((PRIVATE / 'approval.json').read_text(encoding='utf-8'))
    if manifest.get('approved') is not True:
        raise SystemExit('Сначала утвердите действующие документы.')
    REVIEW.mkdir(mode=0o700, parents=True, exist_ok=True)
    REVIEW.chmod(0o700)
    for name in NAMES:
        data = (LEGAL / (name + '.html')).read_bytes()
        if hashlib.sha256(data).hexdigest() != manifest['files'][name]:
            raise SystemExit('Контрольная сумма действующего документа не совпадает: ' + name)
        if name in ('offer', 'refund'):
            text = (ROOT / 'docs/legal-release' / (name + '.html')).read_text(encoding='utf-8')
            data = text.replace('{{EFFECTIVE_DATE}}', datetime.now().strftime('%d.%m.%Y')).encode()
        atomic(REVIEW / (name + '.html'), data, 0o600)
    print('Расширенная оферта и возврат подготовлены:', REVIEW)

def publish(full_catalog=False):
    pages = {}
    for name in NAMES:
        text = (REVIEW / (name + ".html")).read_text(encoding="utf-8")
        if not text.strip() or re.search(r"\{\{[A-Z_]+\}\}|ПРОЕКТ · НЕ УТВЕРЖДЕНО|не является действующей офертой", text, re.I):
            raise SystemExit("Нельзя публиковать незавершенный документ: " + name)
        pages[name] = text.encode()
    if full_catalog and not all(x in pages["offer"].decode() for x in ("Signature Collection", "BrickLab Plus", "Founder’s Club", "Дополнительные облачные проекты")):
        raise SystemExit("Расширенная оферта не подготовлена.")
    if input("После проверки всех четырех документов введите УТВЕРЖДАЮ: ").strip() != "УТВЕРЖДАЮ":
        raise SystemExit("Публикация отменена.")
    if not ENV.is_file():
        raise SystemExit("Не найден .env.")
    now = datetime.now(timezone.utc)
    backup = Path("/var/backups/bricklab-commerce") / ("legal-" + now.strftime("%Y%m%d-%H%M%S"))
    backup.mkdir(mode=0o700, parents=True, exist_ok=False)
    for name in NAMES:
        old = LEGAL / (name + ".html")
        if old.is_file():
            shutil.copy2(old, backup / old.name)
    approval = PRIVATE / "approval.json"
    if approval.is_file():
        shutil.copy2(approval, backup / approval.name)
    shutil.copy2(ENV, backup / ".env")
    for name, data in pages.items():
        atomic(LEGAL / (name + ".html"), data)
    manifest = {"approved": True, "approvedAt": now.isoformat(),
                "files": {name: hashlib.sha256(data).hexdigest() for name, data in pages.items()}}
    atomic(approval, (json.dumps(manifest, indent=2) + "\n").encode())
    # The app runs as an unprivileged node user. Permit traversal of the
    # bind-mounted directories without exposing their listings or review files.
    LEGAL.chmod(0o711)
    PRIVATE.chmod(0o711)
    REVIEW.chmod(0o700)
    env = ENV.read_text(encoding="utf-8")
    updates = {
        "BRICKLAB_COMMERCE_APPROVAL_FILE": "/app/private-commerce/approval.json",
        "BRICKLAB_YOOKASSA_LIVE_ENABLED": "false",
        "BRICKLAB_COMMERCE_FULL_CATALOG_OFFER_VERSION": hashlib.sha256(":".join(manifest["files"][name] for name in NAMES).encode()).hexdigest() if full_catalog else "",
    }
    for key, value in updates.items():
        env = re.sub(r"(?m)^\s*(?:export\s+)?" + re.escape(key) + r"\s*=.*\n?", "", env)
        env = env.rstrip("\n") + "\n" + key + "=" + value + "\n"
    atomic(ENV, env.encode(), 0o600)
    print("Документы утверждены оператором и записаны. Резервная копия:", backup)
    print("Для публикации через HTTP пересоздайте только контейнер bricklab. Реальные платежи выключены.")

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("action", choices=["prepare", "publish", "prepare-catalog", "publish-catalog"])
    a = p.parse_args()
    if os.geteuid() != 0:
        raise SystemExit("Запустите от root на VPS.")
    if a.action == "prepare-catalog":
        prepare_catalog()
    elif a.action == "publish-catalog":
        publish(full_catalog=True)
    elif a.action == "prepare":
        prepare()
    else:
        publish()
