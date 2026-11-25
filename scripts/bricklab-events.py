#!/usr/bin/env python3
"""Host-only Telegram outbox dispatcher. Never prints bot credentials or message bodies."""
import argparse
import datetime
import fcntl
import json
import os
import re
import stat
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = "/opt/bricklab-cloud"
CONFIG = "/etc/bricklab-backup/telegram.json"
ORIGIN = "https://bricklab-3d.ru"
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
KINDS = {"registration","profile","build","build_update","build_report","comment_report",
         "test_paid","test_mismatch","moderation","bug","daily","milestone"}
CATEGORY = {"vehicles":"Транспорт","mechanisms":"Механизмы","architecture":"Архитектура","robots":"Роботы","other":"Другое"}
REASON = {"spam":"Спам","abuse":"Оскорбления","copyright":"Авторские права","other":"Другое"}

class DeliveryError(Exception):
    def __init__(self, code, delay=0):
        self.code, self.delay = code, delay

def config():
    with open(CONFIG, "r", encoding="utf-8") as file:
        info = os.fstat(file.fileno())
        if info.st_uid != 0 or stat.S_IMODE(info.st_mode) & 0o077:
            raise RuntimeError("config_permissions")
        c = json.load(file)
    if not re.fullmatch(r"\d+:[A-Za-z0-9_-]{20,}", str(c.get("token",""))):
        raise RuntimeError("invalid_token")
    if not re.fullmatch(r"-?\d+", str(c.get("chat_id",""))):
        raise RuntimeError("invalid_chat_id")
    # Optional separate settings. Existing monitor config needs no modification.
    settings = "/etc/bricklab-backup/events.json"
    try:
        with open(settings, encoding="utf-8") as file:
            options = json.load(file)
    except FileNotFoundError:
        options = {}
    disabled = options.get("disabled", [])
    if not isinstance(disabled, list) or not all(x in KINDS for x in disabled):
        raise RuntimeError("invalid_disabled_events")
    c["disabled"] = set(disabled)
    return c

def db(sql):
    # Credentials remain in the existing db container environment, not argv/logs.
    result = subprocess.run(["docker","compose","exec","-T","db","sh","-c",
        'PGPASSWORD="$POSTGRES_PASSWORD" exec psql -X -qAt -v ON_ERROR_STOP=1 -h 127.0.0.1 -U bricklab_admin -d bricklab'],
        input=sql, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        cwd=ROOT, timeout=20)
    if result.returncode:
        raise RuntimeError("database_query_failed")
    return result.stdout.strip()

def clean(value, limit=120):
    s = str(value or "—")
    s = re.sub(r"[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]", " ", s)
    s = re.sub(r"https?://\S+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", "[скрыто]", s)
    return s[:limit]

def link(path, value):
    return ORIGIN + path + value if isinstance(value,str) and UUID.fullmatch(value) else None

def message(event):
    kind, p = event["kind"], event["payload"]
    buttons = []
    def add(title, url):
        if url: buttons.append([{"text": title, "url": url}])
    def n(key): return int(p.get(key) or 0)
    if kind == "registration":
        body = "👤 Новый аккаунт BrickLab\nПочта: " + ("подтверждена" if p.get("verified") else "не подтверждена")
        body += "\nВсего аккаунтов: " + str(n("total"))
        # Do not export private display name or email; operator views the authorized card.
        add("Открыть аккаунт",link("/#account/admin/user/",p.get("userId")))
        add("Публичный профиль",link("/#community/profile/",p.get("profileId")))
    elif kind == "profile":
        body = "🪪 Новый публичный профиль\n" + clean(p.get("name"))
        add("Открыть профиль",link("/#community/profile/",p.get("profileId")))
    elif kind in ("build","build_update"):
        body = ("🧱 Новая сборка" if kind=="build" else "🔄 Новая версия сборки")
        body += "\n"+clean(p.get("title"))+"\nАвтор: "+clean(p.get("author"))
        body += "\nКатегория: "+CATEGORY.get(p.get("category"),"Другое")
        body += f"\nДеталей: {n('parts')} · версия {n('revision')}\nСкачивание: "+("разрешено" if p.get("download") else "запрещено")
        add("Открыть сборку",link("/#community/build/",p.get("buildId")))
        add("Профиль автора",link("/#community/profile/",p.get("profileId")))
        if n("images")>0:
            url=link("/api/community/build/",p.get("buildId"))
            add("Обложка сборки",url+"/image/0" if url else None)
    elif kind in ("build_report","comment_report"):
        body = ("🚩 Жалоба на сборку" if kind=="build_report" else "🚩 Жалоба на комментарий")
        body += "\nПричина: "+REASON.get(p.get("reason"),"Другое")
        add("Открыть жалобы",ORIGIN+"/#account/admin/"+("build-reports" if kind=="build_report" else "reports"))
        add("Сборка",link("/#community/build/",p.get("buildId")))
    elif kind == "test_paid":
        body = f"🧪 ТЕСТОВАЯ оплата Robokassa\nЗаказ #{n('invoice')}\nТема: {clean(p.get('sku'))}\nСумма: {n('kopecks')//100}.{n('kopecks')%100:02d} ₽\nНе реальная выручка."
        add("BrickLab Finance",ORIGIN+"/#store")
    elif kind == "test_mismatch":
        body = f"⚠️ Тестовая оплата: несоответствие заказа #{n('invoice')}\nПокупка не подтверждена."
        add("BrickLab Finance",ORIGIN+"/#store")
    elif kind == "moderation":
        body = "🛡 Действие модерации\n"+clean(p.get("action"))
        add("Журнал действий",ORIGIN+"/#account/admin/audit")
    elif kind == "bug":
        body = "🐞 Новый баг-репорт\nОписание доступно только в админ-панели."
        add("Открыть отчёт",link("/#account/admin/bug/",p.get("reportId")))
    elif kind == "milestone":
        body = f"🎉 BrickLab достиг {n('target')} аккаунтов!\nВсего сейчас: {n('total')}"
        add("Статистика",ORIGIN+"/#account/admin/overview")
    elif kind == "daily":
        body = f"📊 BrickLab · сводка за {clean(p.get('day'),10)}\n"
        body += f"Новые аккаунты: {n('newUsers')}\nВсего аккаунтов: {n('totalUsers')}\nПодтверждено: {n('verified')}\nПубличные профили: {n('profiles')}\nПубличные сборки: {n('builds')}\nНовые сборки: {n('newBuilds')}\nКомментарии: {n('comments')}\nНеразобранные жалобы: {n('reports')}\nТестовые оплаты: {n('testPaid')}\nВсего уникальных реакций: {n('likes')}\nПросмотров: {n('views')} · скачиваний: {n('downloads')}\nПодписок: {n('follows')}"
        add("Администрирование",ORIGIN+"/#account/admin/overview")
    else:
        raise RuntimeError("unknown_event")
    stamp=datetime.datetime.fromisoformat(event["created_at"]).astimezone(datetime.timezone(datetime.timedelta(hours=3))).strftime("%d.%m.%Y %H:%M МСК")
    return {"text":body+"\n\n"+stamp, "reply_markup":{"inline_keyboard":buttons},
            "link_preview_options":{"is_disabled":True}, "protect_content":True,
            "disable_notification":kind in ("daily","build_update","moderation")}

def deliver(c, payload):
    data=json.dumps({"chat_id":c["chat_id"],**payload},ensure_ascii=False).encode()
    request=urllib.request.Request("https://api.telegram.org/bot"+c["token"]+"/sendMessage",
                                   data=data,headers={"Content-Type":"application/json"},method="POST")
    try:
        with urllib.request.urlopen(request,timeout=12) as response:
            answer=json.load(response)
        if answer.get("ok") is not True:
            raise DeliveryError("telegram_rejected")
    except urllib.error.HTTPError as e:
        delay=0
        if e.code==429:
            try: delay=int(json.loads(e.read(8192)).get("parameters",{}).get("retry_after",0))
            except Exception: pass
        raise DeliveryError("http_"+str(e.code), min(86400,max(0,delay))) from None
    except (OSError,ValueError):
        raise DeliveryError("network_or_response") from None

def run(c):
    db("SELECT bricklab.prepare_notification_digest();")
    rows=db("""SELECT json_build_object('id',o.id,'kind',o.kind,'created_at',o.created_at,'attempts',o.attempts,
     'payload',CASE WHEN o.kind='registration' THEN o.payload||jsonb_build_object(
       'verified',EXISTS(SELECT 1 FROM bricklab.users u WHERE u.id=(o.payload->>'userId')::uuid AND u.email_verified_at IS NOT NULL),
       'total',(SELECT count(*) FROM bricklab.users),
       'profileId',(SELECT public_id FROM bricklab.public_profiles WHERE user_id=(o.payload->>'userId')::uuid))
       ELSE o.payload END)::text
     FROM bricklab.notification_outbox o WHERE sent_at IS NULL AND next_attempt<=now()
     ORDER BY id LIMIT 20;""")
    for line in rows.splitlines():
        event=json.loads(line)
        ident=int(event["id"])
        if event["kind"] in c["disabled"]:
            db(f"UPDATE bricklab.notification_outbox SET sent_at=now(),last_error='disabled' WHERE id={ident};")
            continue
        try:
            deliver(c,message(event))
        except DeliveryError as e:
            delay=max(e.delay,min(3600,60*2**min(6,int(event["attempts"]))))
            code=e.code if re.fullmatch(r"[a-z0-9_]+",e.code) else "delivery_failed"
            db(f"UPDATE bricklab.notification_outbox SET attempts=attempts+1,next_attempt=now()+{delay}*interval '1 second',last_error='{code}' WHERE id={ident};")
            print("Telegram delivery delayed: "+code, file=sys.stderr)
            return 1
        db(f"UPDATE bricklab.notification_outbox SET sent_at=now(),last_error=NULL WHERE id={ident};")
        time.sleep(0.1)
    db("""DELETE FROM bricklab.notification_outbox WHERE sent_at<now()-interval '30 days';
       DELETE FROM bricklab.operator_bug_reports WHERE created_at<now()-interval '90 days';""")
    return 0

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--test",action="store_true")
    parser.add_argument("--status",action="store_true")
    args=parser.parse_args()
    try:
        if args.status:
            print(db("SELECT json_build_object('pending',count(*) FILTER (WHERE sent_at IS NULL),'delivered',count(*) FILTER (WHERE sent_at IS NOT NULL AND last_error IS NULL),'disabled',count(*) FILTER (WHERE last_error='disabled'),'retrying',count(*) FILTER (WHERE sent_at IS NULL AND attempts>0),'oldestPending',min(created_at) FILTER (WHERE sent_at IS NULL)) FROM bricklab.notification_outbox;"))
            return 0
        c=config()
        with open("/run/lock/bricklab-events.lock","a") as lock:
            try: fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
            except BlockingIOError: return 0
            if args.test:
                deliver(c,{"text":"✅ BrickLab Events: Telegram-канал подключён.","protect_content":True})
                print("Telegram test delivered")
                return 0
            return run(c)
    except DeliveryError as e:
        print("Telegram test failed: "+e.code,file=sys.stderr)
    except Exception as e:
        # Never log exception repr/URL, as these can contain the bot token.
        print("BrickLab Events failed: "+type(e).__name__,file=sys.stderr)
    return 1

if __name__=="__main__":
    sys.exit(main())
