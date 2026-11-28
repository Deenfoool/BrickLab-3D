#!/usr/bin/env python3
"""Switch the existing storefront to live YooKassa after explicit operator approval.
No payments are created by this command. Credentials remain on the VPS.
"""
import base64
from datetime import datetime
from getpass import getpass
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import tempfile
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

if os.geteuid() != 0:
    raise SystemExit("Запустите от root на VPS.")
root = Path(__file__).resolve().parents[1]
env = root / ".env"
text = env.read_text(encoding="utf-8")
legal = Path("/var/lib/bricklab-legal")
manifest = json.loads(Path("/var/lib/bricklab-commerce-private/approval.json").read_text())
names = ("offer", "privacy", "refund", "requisites")
if manifest.get("approved") is not True:
    raise SystemExit("Юридические документы не утверждены.")
for name in names:
    if hashlib.sha256((legal / (name + ".html")).read_bytes()).hexdigest() != manifest["files"][name]:
        raise SystemExit("Не совпадает контрольная сумма документа: " + name)
version = hashlib.sha256(":".join(manifest["files"][name] for name in names).encode()).hexdigest()
if not re.search(r"(?m)^BRICKLAB_COMMERCE_FULL_CATALOG_OFFER_VERSION="+version+r"$", text):
    raise SystemExit("Сначала утвердите оферту расширенного магазина (publish-catalog).")
if "Для контроля платежей и возвратов в закрытый чат оператора Telegram" not in (legal / "privacy.html").read_text(encoding="utf-8"):
    raise SystemExit("Сначала утвердите новую политику конфиденциальности через prepare-catalog и publish-catalog.")
if any(not re.search(r"(?m)^"+key+r"=.+$", text) for key in ("BRICKLAB_MAIL_USER","BRICKLAB_MAIL_KEY","BRICKLAB_MAIL_FROM")):
    raise SystemExit("Для отправки чеков сначала настройте почтовый сервис.")
if input("Договор подписан, ЮKassa разрешила приём платежей, есть возможность своевременно формировать чеки НПД и отправлять покупателям? Введите ПОДТВЕРЖДАЮ: ").strip() != "ПОДТВЕРЖДАЮ":
    raise SystemExit("Переключение отменено.")
shop = input("Shop ID боевого магазина: ").strip()
secret = getpass("Боевой секретный ключ: ").strip()
if not re.fullmatch(r"\d{1,20}", shop) or not re.fullmatch(r"live_[A-Za-z0-9_*-]{11,}", secret):
    raise SystemExit("Неверный формат реквизитов.")
test_shop = re.search(r"(?m)^BRICKLAB_YOOKASSA_TEST_SHOP_ID=(\d+)$", text)
if test_shop and test_shop.group(1) == shop:
    raise SystemExit("Боевой и тестовый магазины должны различаться.")
# Read-only API probe; no payment or refund operation is made.
auth = base64.b64encode((shop+":"+secret).encode()).decode()
try:
    with urlopen(Request("https://api.yookassa.ru/v3/payments?limit=1", headers={"Authorization":"Basic "+auth,"Accept":"application/json"}), timeout=15) as response:
        data = json.load(response)
        if response.status != 200 or not isinstance(data.get("items"), list) or any(p.get("test") is not False for p in data["items"]):
            raise SystemExit("Проверка боевого магазина не пройдена.")
except (HTTPError, URLError, TimeoutError):
    raise SystemExit("API ЮKassa не подтвердил доступ. Реквизиты не изменены.")
if input("Подключить боевой магазин, оставив новые оплаты закрытыми? Введите ВКЛЮЧИТЬ: ").strip() != "ВКЛЮЧИТЬ":
    raise SystemExit("Переключение отменено.")
backup = Path("/var/backups/bricklab-commerce")
backup.mkdir(mode=0o700, parents=True, exist_ok=True)
backup.chmod(0o700)
target = backup / ("env-live-"+datetime.now().strftime("%Y%m%d-%H%M%S"))
shutil.copyfile(env,target)
target.chmod(0o600)
for key,value in {
    "BRICKLAB_COMMERCE_MODE":"live",
    "BRICKLAB_LIVE_CHECKOUT_SCOPE":"closed",
    "BRICKLAB_YOOKASSA_LIVE_ENABLED":"true",
    "BRICKLAB_YOOKASSA_LIVE_SHOP_ID":shop,
    "BRICKLAB_YOOKASSA_LIVE_SECRET":secret,
    "BRICKLAB_NPD_RECEIPTS_READY":"true",
}.items():
    text = re.sub(r"(?m)^[ \t]*"+re.escape(key)+r"[ \t]*=.*\n?", "", text)
    text = text.rstrip("\n")+"\n"+key+"="+value+"\n"
fd, temp = tempfile.mkstemp(prefix=".env-live-", dir=root)
try:
    with os.fdopen(fd,"w",encoding="utf-8") as f:
        f.write(text)
        f.flush()
        os.fsync(f.fileno())
    os.chmod(temp,0o600)
    os.replace(temp,env)
finally:
    if os.path.exists(temp):
        os.unlink(temp)
print("Боевые реквизиты настроены. Новые оплаты закрыты. Пересоздайте контейнер только после подготовки чеков.")
print("Тестовые заказы остаются отдельными. Секреты не выводились.")
