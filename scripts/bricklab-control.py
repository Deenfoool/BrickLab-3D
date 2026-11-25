#!/usr/bin/env python3
"""Private Telegram operator interface with a fixed-action local broker. No subprocess or Docker access."""
import json
import os
import pathlib
import re
import secrets
import socket
import stat
import time
import urllib.request
import urllib.error

ORIGIN = "https://bricklab-3d.ru"
SNAPSHOT = pathlib.Path("/run/bricklab-control/snapshot.json")
MENUS = {
    "home": [("🖥 VPS", "vps"), ("🐳 Docker", "docker"), ("📊 Статистика", "stats"),
             ("🧱 Сообщество", "community"), ("💾 Бэкапы", "backup"), ("🔔 События", "events"),
             ("🚀 Версия", "release"), ("📋 Диагностика логов", "logs"), ("🛡 Журнал действий", "audit"), ("👥 Пользователи", "users"),
             ("🧱 Публикации", "builds"), ("🚩 Жалобы", "reports"), ("🐞 Баг-репорты", "bugs"),
             ("🐙 GitHub", "github"), ("⚙ Автоматизация", "automation"), ("📈 Аналитика 7 дней", "analytics")],
}
LINKS = {
    "community": [("Администрирование", "/#account/admin/overview"),
                  ("Жалобы на сборки", "/#account/admin/build-reports"),
                  ("Жалобы на комментарии", "/#account/admin/reports"),
                  ("Журнал модерации", "/#account/admin/audit")],
    "users": [("Все пользователи", "/#account/admin/users")],
    "builds": [("Управление публикациями", "/#account/admin/content")],
    "reports": [("Жалобы на сборки", "/#account/admin/build-reports"), ("Жалобы на комментарии", "/#account/admin/reports")],
    "bugs": [("Все баг-репорты", "/#account/admin/bugs")],
    "stats": [("Открыть статистику", "/#account/admin/overview")],
    "events": [("Администрирование", "/#account/admin/overview")],
}
ACTION_SOCKET = pathlib.Path("/run/bricklab-control-actions.sock")
ACTIONS = {"restart": ("Перезапустить BrickLab", "Приложение будет кратковременно недоступно."),
           "backup": ("Создать резервные копии", "Запустятся существующие службы бэкапа БД и конфигурации."),
           "deploy": ("Запустить утверждённый релиз", "Будет запущена проверка и установка заранее утверждённого на VPS SHA.")}
PENDING = {}
RESULTS = {"approval_required": "⚠ Нет утверждённого релиза. Требуется отдельное подтверждение на VPS.",
           "queued": "⏳ Запуск службы запрошен. Это не успешный релиз; результат в разделе Версия.", "ok": "✅ Операция завершена.", "failed": "❌ Операция завершилась ошибкой.",
           "health_failed": "⚠ Перезапуск выполнен, но API не прошёл проверку.",
           "not_running": "⚠ Приложение не запущено. Перезапуск отменён.",
           "busy": "⏳ Уже выполняется операция или развёртывание.",
           "cooldown": "⏳ Ограничение частоты. Повторите позже.",
           "duplicate": "⚠ Запрос уже обработан или начат ранее.",
           "unknown": "⚠ Результат неизвестен. Проверьте состояние и журнал; автоматического повтора нет."}

def actions_enabled():
    try:
        return stat.S_ISSOCK(ACTION_SOCKET.stat().st_mode)
    except OSError:
        return False

def broker(action, ident):
    try:
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as conn:
            conn.settimeout(250)
            conn.connect(str(ACTION_SOCKET))
            conn.sendall((json.dumps({"action": action, "id": ident}) + "\n").encode())
            with conn.makefile("rb") as reader:
                result = reader.readline(64).decode().strip()
            return result if result in RESULTS else "unknown"
    except (OSError, UnicodeError):
        return "unknown"

PAGES = {"home", "vps", "docker", "stats", "community", "backup", "events", "release", "logs", "audit", "users", "builds", "reports", "bugs", "github", "automation", "analytics"}

class ApiError(Exception):
    def __init__(self, code, delay=0):
        self.code, self.delay = code, delay

def config(path):
    data = json.loads(path.read_text())
    token = str(data.get("token", ""))
    owner = str(data.get("chat_id", ""))
    if not re.fullmatch(r"[0-9]+:[A-Za-z0-9_-]{20,}", token):
        raise ValueError("invalid token")
    # A private Telegram chat ID equals its user's ID. Group destinations are refused.
    if not re.fullmatch(r"[1-9][0-9]{0,18}", owner):
        raise ValueError("private owner chat required")
    return token, int(owner)

def authorized(message, sender, owner):
    chat = message.get("chat", {})
    return chat.get("type") == "private" and chat.get("id") == owner and sender.get("id") == owner

def snapshot():
    try:
        data = json.loads(SNAPSHOT.read_text())
        age = time.time() - float(data["timestamp"])
        if not 0 <= age <= 180:
            return {}
        return data
    except (OSError, ValueError, KeyError, TypeError):
        return {}

GITHUB_CACHE = {"until": 0, "data": {}}

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def github_get(path):
    token_path = pathlib.Path(os.environ.get("CREDENTIALS_DIRECTORY","/nonexistent")) / "github.token"
    headers = {"Accept":"application/vnd.github+json","User-Agent":"BrickLab-Control-Center","X-GitHub-Api-Version":"2022-11-28"}
    try:
        token = token_path.read_text().strip()
        if re.fullmatch(r"[A-Za-z0-9_]{20,255}",token):
            headers["Authorization"] = "Bearer " + token
    except OSError:
        pass
    req = urllib.request.Request("https://api.github.com/repos/Deenfoool/BrickLab-3D/" + path,headers=headers)
    with urllib.request.build_opener(NoRedirect()).open(req,timeout=5) as r:
        return json.loads(r.read(512*1024))

def github_status():
    if GITHUB_CACHE["until"] > time.monotonic():
        return GITHUB_CACHE["data"]
    data = {}
    try:
        head = github_get("commits/feature/cloud-migration").get("sha")
        if isinstance(head,str) and re.fullmatch(r"[a-f0-9]{40}",head):
            data["remote"] = head
            runs = github_get("actions/runs?per_page=10&head_sha=" + head).get("workflow_runs",[])
            states = [str(x.get("conclusion") or x.get("status") or "unknown") for x in runs
                      if x.get("head_sha") == head]
            data["ci"] = ", ".join(states)[:160] or "нет запусков для SHA"
        else:
            data["ci"] = "нет данных"
    except (OSError, ValueError, TypeError, AttributeError):
        data["ci"] = "недоступно (права, сеть или лимит API)"
    GITHUB_CACHE.update(until=time.monotonic()+300,data=data)
    return data

def render(page, data):
    def value(section, key):
        return str(data.get(section, {}).get(key, "нет данных"))
    def lines(section, fields):
        return "\n".join(label + ": " + value(section, key) for label, key in fields)
    github = github_status() if page == "github" else {}
    recent = data.get("audit", {}).get("recent")
    history = "нет данных" if recent is None else "\n".join(
        row["date"] + " · " + ("Авто · " if row.get("source") == "recovery" else "Telegram · ") + ACTIONS[row["action"]][0] + " · " +
        ("начата; результат неизвестен" if row["result"] == "started" else RESULTS.get(row["result"], "неизвестно"))
        for row in recent) or "Операций пока нет."
    def records(key):
        rows = data.get("admin", {}).get(key)
        if rows is None:
            return "Нет данных."
        if not rows:
            return "Записей пока нет."
        output = []
        for row in rows[:5]:
            ident = str(row.get("id",""))
            if not re.fullmatch(r"[0-9a-f-]{36}",ident):
                continue
            label = ident[:8] + " · " + str(row.get("day",""))[:10]
            if key == "users":
                label += " · " + ("почта подтверждена" if row.get("verified") else "без подтверждения")
                if row.get("blocked"):
                    label += " · заблокирован"
            elif key == "builds":
                label += " · деталей: " + str(row.get("parts",0))
            output.append(label)
        return "\n".join(output) or "Нет записей."
    trend = data.get("analytics",{}).get("days")
    trend_text = "Нет данных." if not isinstance(trend,list) else "\n".join(
        str(row["day"])[5:10] + " · " + str(row["users"]) + " / " + str(row["builds"]) for row in trend)
    bodies = {
        "home": "BrickLab Control Center\nAPI: " + value("vps", "api") + "\nВыберите раздел.",
        "vps": "🖥 VPS\n" + lines("vps", [("API локально", "api"), ("HTTPS извне (проверка с VPS)", "https"),
                     ("CPU за 1 с", "cpu"), ("RAM", "ram"), ("Диск /opt", "disk"), ("Uptime", "uptime")]),
        "docker": "🐳 Docker / PostgreSQL\n" + lines("docker", [("BrickLab", "bricklab"), ("PostgreSQL", "db"), ("SQL", "sql")]),
        "stats": "📊 Статистика\n" + lines("stats", [("Аккаунты", "users"), ("Подтверждены", "verified"),
                     ("Новые за 24 ч", "new_users"), ("Публичные профили", "profiles"), ("Публичные сборки", "builds")]),
        "community": "🧱 Сообщество\n" + lines("stats", [("Жалобы на сборки", "build_reports"),
                     ("Жалобы на комментарии", "comment_reports"), ("Баг-репорты за 24 ч", "bugs")])
                     + "\nИзменения выполняются в защищённой веб-админке.",
        "backup": "💾 Резервное копирование\n" + lines("backup", [("База", "db"), ("Конфигурация", "config"), ("Последняя проверка восстановления","verification")])
                  + "\nСтатус systemd, не доказательство восстановления копии.",
        "events": "🔔 BrickLab Events\n" + lines("events", [("В очереди", "pending"), ("Повторные попытки", "retrying"),
                     ("Доставлено (хранится до 30 дней)", "delivered"), ("Таймер", "timer")]),
        "users": "👥 Последние аккаунты\n" + records("users") + "\nПерсональные данные и блокировки — только в веб-админке.",
        "builds": "🧱 Последние публичные сборки\n" + records("builds"),
        "reports": "🚩 Неразобранные жалобы\n" + lines("stats", [("На сборки", "build_reports"), ("На комментарии", "comment_reports")]) + "\nРешение жалоб — в веб-админке.",
        "bugs": "🐞 Последние баг-репорты\n" + records("bugs") + "\nОписание, логи и личные данные не отправляются в Telegram.",
        "github": "🐙 GitHub / релиз\n" + lines("release", [("Checkout", "commit"), ("Последний локально полученный origin", "tracking"), ("Отставание (коммитов)", "behind"), ("Рабочее дерево", "worktree")]) + "\nGitHub SHA: " + github.get("remote","нет данных") + "\nCI для GitHub SHA: " + github.get("ci","нет данных") + "\nGitHub обновляется не чаще раза в 5 минут. Развёртывание — только утверждённого SHA в разделе Версия.",
        "analytics": "📈 Аналитика за 7 календарных дней (часовой пояс БД)\nДата · аккаунты / текущие сборки по дате публикации\n" + trend_text + "\n\n" + lines("analytics",[("Реакции всего","likes"),("Просмотры (учтённые события)","views"),("Скачивания (учтённые события)","downloads"),("Подписки","follows"),("Деталей в публичных сборках","parts")]),
        "automation": "⚙ Автоматизация\n" + automation_description() + "\nАвтовосстановление: " + value("automation","recovery") + "\nОбслуживание: " + value("automation","maintenance") + "\nНе меняет существующие службы мониторинга и Events.",
        "audit": "🛡 Последние операции VPS\n" + history,
        "logs": "📋 Диагностика логов (последние 200 строк за 1 ч)\n" + lines("logs", [("Строки", "lines"), ("С ошибками", "errors"), ("С предупреждениями", "warnings")]) + "\nСодержимое логов не передаётся в Telegram.",
        "release": "🚀 Развёрнутая версия (checkout)\n" + value("release", "commit")
                     + "\nУтверждённый SHA: " + value("release","approved") + "\nСлужба релиза: " + value("release","job") + "\nОткат только по проверенной процедуре VPS.",
    }
    text = bodies[page]
    if not data:
        text += "\n⚠ Снимок отсутствует или устарел. Статус неизвестен."
    buttons = [[{"text": label, "callback_data": "cc:" + key} for label, key in MENUS["home"][i:i+2]]
               for i in range(0, len(MENUS["home"]), 2)] if page == "home" else []
    buttons += [[{"text": label, "url": ORIGIN + path}] for label, path in LINKS.get(page, [])]
    if page in ("users", "builds", "bugs"):
        routes = {"users": "/#account/admin/user/", "builds": "/#community/build/", "bugs": "/#account/admin/bug/"}
        for row in (data.get("admin", {}).get(page) or [])[:5]:
            ident = str(row.get("id",""))
            if re.fullmatch(r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}",ident,re.I):
                buttons.append([{"text": "Открыть " + ident[:8], "url": ORIGIN + routes[page] + ident}])
    if page in ("github", "release"):
        repo = "https://github.com/Deenfoool/BrickLab-3D"
        buttons.extend([[{"text": name, "url": repo + path}] for name,path in
                        [("Коммиты", "/commits/feature/cloud-migration"), ("CI / тесты", "/actions"),
                         ("Pull Requests", "/pulls"), ("Issues", "/issues"), ("Новый Issue", "/issues/new")]])
    if page == "automation":
        buttons.extend([[{"text": name, "callback_data": "pref:" + key}] for name,key in
                        [("Выключить уведомления" if preferences().get("enabled") else "Включить уведомления", "off" if preferences().get("enabled") else "on"), ("Тишина на 1 час", "quiet"), ("Снять тишину", "resume")]])
    if page == "home" and os.environ.get("BRICKLAB_MINIAPP_ENABLED") == "1":
        buttons.append([{"text":"📱 Панель управления", "web_app":{"url":ORIGIN+"/control/"}}])
    if page == "release":
        buttons.append([{"text": "GitHub", "url": "https://github.com/Deenfoool/BrickLab-3D"}])
    if actions_enabled() and page in ("docker", "backup", "release"):
        action = {"docker":"restart","backup":"backup","release":"deploy"}[page]
        buttons.append([{"text": ACTIONS[action][0], "callback_data": "act:" + action}])
    buttons.append([{"text": "🔄 Обновить", "callback_data": "cc:" + page}])
    if page != "home":
        buttons.append([{"text": "⬅ Меню", "callback_data": "cc:home"}])
    return {"text": text, "reply_markup": {"inline_keyboard": buttons},
            "link_preview_options": {"is_disabled": True}}

def api(token, method, payload, timeout=15):
    req = urllib.request.Request("https://api.telegram.org/bot" + token + "/" + method,
          data=json.dumps(payload, ensure_ascii=False).encode(),
          headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            result = json.load(response)
        if result.get("ok") is not True:
            raise ApiError("rejected")
        return result["result"]
    except urllib.error.HTTPError as exc:
        delay = 0
        if exc.code == 429:
            try:
                delay = int(json.loads(exc.read(8192)).get("parameters", {}).get("retry_after", 0))
            except (ValueError, TypeError, OSError):
                pass
        raise ApiError(str(exc.code), min(3600, max(0, delay))) from None
    except (OSError, ValueError):
        raise ApiError("network") from None

def handle_action(data, cb, msg, owner, call):
    kind, key = data.split(":", 1)
    now = time.monotonic()
    for nonce, pending in list(PENDING.items()):
        if pending[2] < now:
            del PENDING[nonce]
    if not actions_enabled():
        return
    if kind == "act":
        if key not in ACTIONS:
            return
        call("answerCallbackQuery", {"callback_query_id": cb["id"]})
        PENDING.clear()
        nonce = secrets.token_hex(12)
        PENDING[nonce] = (key, msg["message_id"], now + 60)
        call("editMessageText", {"chat_id": owner, "message_id": msg["message_id"],
             "text": ACTIONS[key][0] + "\n" + ACTIONS[key][1] + "\nПодтвердите в течение 60 секунд.",
             "reply_markup": {"inline_keyboard": [[{"text": "Подтвердить", "callback_data": "yes:" + nonce},
                                                       {"text": "Отмена", "callback_data": "no:" + nonce}]]}})
        return
    pending = PENDING.get(key)
    if not pending or pending[1] != msg["message_id"]:
        call("answerCallbackQuery", {"callback_query_id": cb["id"], "text": "Подтверждение истекло."})
        return
    del PENDING[key]
    call("answerCallbackQuery", {"callback_query_id": cb["id"]})
    action = pending[0]
    if kind == "no":
        call("editMessageText", {"chat_id": owner, "message_id": msg["message_id"],
                                 **render({"restart":"docker","backup":"backup","deploy":"release"}[action], snapshot())})
        return
    call("editMessageText", {"chat_id": owner, "message_id": msg["message_id"],
                             "text": "⏳ Выполняется: " + ACTIONS[action][0],
                             "reply_markup": {"inline_keyboard": []}})
    result = broker(action, key)
    call("editMessageText", {"chat_id": owner, "message_id": msg["message_id"],
                             "text": ACTIONS[action][0] + "\n" + RESULTS[result],
                             "reply_markup": {"inline_keyboard": [[{"text": "⬅ Меню", "callback_data": "cc:home"}]]}})

def handle(update, owner, call):
    if "callback_query" in update:
        cb = update["callback_query"]
        msg = cb.get("message", {})
        if not authorized(msg, cb.get("from", {}), owner):
            return
        data = cb.get("data", "")
        if not isinstance(data, str):
            return
        if data in ("pref:on","pref:off","pref:quiet","pref:resume"):
            call("answerCallbackQuery", {"callback_query_id": cb["id"]})
            update_preferences(data[5:])
            try:
                call("editMessageText", {"chat_id": owner, "message_id": msg["message_id"], **render("automation",snapshot())})
            except ApiError as exc:
                if exc.code != "400":
                    raise
            return
        if data.startswith(("act:", "yes:", "no:")):
            handle_action(data, cb, msg, owner, call)
            return
        if not data.startswith("cc:") or data[3:] not in PAGES:
            return
        call("answerCallbackQuery", {"callback_query_id": cb["id"]})
        try:
            call("editMessageText", {"chat_id": owner, "message_id": msg["message_id"],
                                     **render(data[3:], snapshot())})
        except ApiError as exc:
            if exc.code != "400":
                raise
            # Identical refresh commonly returns 400; do not flood chat with duplicates.
        return
    msg = update.get("message", {})
    if not authorized(msg, msg.get("from", {}), owner):
        return
    text = msg.get("text", "")
    if text in ("/start", "/menu", "/status"):
        call("sendMessage", {"chat_id": owner, "protect_content": True,
                             **render("home" if text != "/status" else "vps", snapshot())})

def automation_path():
    directory = os.environ.get("STATE_DIRECTORY")
    return pathlib.Path(directory) / "automation.json" if directory else None

def preferences():
    path = automation_path()
    try:
        data = json.loads(path.read_text()) if path else {}
        return data if isinstance(data,dict) else {}
    except (OSError, ValueError):
        return {}

def save_preferences(data):
    path = automation_path()
    if not path:
        return
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data))
    tmp.replace(path)

def automation_description():
    p = preferences()
    enabled = "включены" if p.get("enabled") else "выключены"
    quiet = "до " + time.strftime("%H:%M UTC", time.gmtime(p["quiet_until"])) if p.get("quiet_until",0)>time.time() else "нет"
    return "Дополнительные алерты: " + enabled + "\nТихий режим: " + quiet + "\nПроверки: API, SQL, RAM, свободное место, очередь событий.\nСуществующие ежедневные сводки Events не изменяются."

def update_preferences(action):
    p = preferences()
    if action in ("on","off"):
        enabled = action == "on"
        if enabled != bool(p.get("enabled",False)):
            p["enabled"] = enabled
            p.pop("last_sample",None)
            p.pop("samples",None)
            p.pop("announced",None)
    elif action == "quiet":
        p["quiet_until"] = int(time.time()) + 3600
    elif action == "resume":
        p["quiet_until"] = 0
    save_preferences(p)

ALERT_LABELS = {"api":"Локальный API недоступен", "sql":"PostgreSQL не отвечает",
                "ram":"RAM ≥ 90%", "disk":"Свободное место ≤ 10%", "events":"В очереди ≥ 20 повторных отправок"}
def alert_flags(data):
    # Missing metrics are unknown, never interpreted as recovery.
    flags = {}
    v = data.get("vps",{})
    d = data.get("docker",{})
    e = data.get("events",{})
    for name, value in (("api",v.get("api")),("sql",d.get("sql"))):
        if value in ("OK","ошибка"):
            flags[name] = value != "OK"
    for name, value, threshold, high in (("ram",v.get("ram_percent"),90,True),("disk",v.get("disk_free_percent"),10,False),("events",e.get("retrying"),20,True)):
        if type(value) in (int,float):
            flags[name] = value >= threshold if high else value <= threshold
    return flags

def check_alerts(owner, call, data=None):
    p = preferences()
    if not p.get("enabled"):
        return
    data = snapshot() if data is None else data
    stamp = data.get("timestamp")
    if type(stamp) not in (int,float) or stamp <= p.get("last_sample",0):
        return
    previous = p.get("samples",{}) if stamp-p.get("last_sample",0)<=180 else {}
    announced = p.get("announced",{})
    flags = alert_flags(data)
    changes = []
    for key, flag in flags.items():
        old = previous.get(key)
        if old == flag and bool(announced.get(key,False)) != flag:
            changes.append((key,flag))
    p["last_sample"] = stamp
    p["samples"] = flags
    if changes and p.get("quiet_until",0) <= time.time():
        text = "BrickLab · мониторинг\n" + "\n".join(("⚠ " if flag else "✅ Восстановлено: ") + ALERT_LABELS[key] for key,flag in changes)
        call("sendMessage", {"chat_id":owner,"text":text,"protect_content":True})
        for key,flag in changes:
            announced[key] = flag
    p["announced"] = announced
    save_preferences(p)

def main():
    token, owner = config(pathlib.Path(os.environ["CREDENTIALS_DIRECTORY"]) / "telegram.json")
    state = pathlib.Path(os.environ["STATE_DIRECTORY"]) / "offset"
    try:
        offset = int(state.read_text())
    except FileNotFoundError:
        offset = 0
    def call(method, payload, timeout=15):
        return api(token, method, payload, timeout)
    while True:
        try:
            check_alerts(owner, call)
            updates = call("getUpdates", {"offset": offset, "timeout": 25,
                           "allowed_updates": ["message", "callback_query"]}, 35)
            for update in updates:
                handle(update, owner, call)
                offset = int(update["update_id"]) + 1
                tmp = state.with_suffix(".tmp")
                tmp.write_text(str(offset))
                tmp.replace(state)
        except ApiError as exc:
            # Never log request URLs, credentials or message bodies.
            print("Telegram request failed: " + exc.code, flush=True)
            time.sleep(max(5, exc.delay, 30 if exc.code == "409" else 0))

if __name__ == "__main__":
    main()
