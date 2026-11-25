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
             ("🚀 Версия", "release"), ("📋 Диагностика логов", "logs"), ("🛡 Журнал действий", "audit")],
}
LINKS = {
    "community": [("Администрирование", "/#account/admin/overview"),
                  ("Жалобы на сборки", "/#account/admin/build-reports"),
                  ("Жалобы на комментарии", "/#account/admin/reports"),
                  ("Журнал модерации", "/#account/admin/audit")],
    "stats": [("Открыть статистику", "/#account/admin/overview")],
    "events": [("Администрирование", "/#account/admin/overview")],
}
ACTION_SOCKET = pathlib.Path("/run/bricklab-control-actions.sock")
ACTIONS = {"restart": ("Перезапустить BrickLab", "Приложение будет кратковременно недоступно."),
           "backup": ("Создать резервные копии", "Запустятся существующие службы бэкапа БД и конфигурации.")}
PENDING = {}
RESULTS = {"ok": "✅ Операция завершена.", "failed": "❌ Операция завершилась ошибкой.",
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

PAGES = {"home", "vps", "docker", "stats", "community", "backup", "events", "release", "logs", "audit"}

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

def render(page, data):
    def value(section, key):
        return str(data.get(section, {}).get(key, "нет данных"))
    def lines(section, fields):
        return "\n".join(label + ": " + value(section, key) for label, key in fields)
    recent = data.get("audit", {}).get("recent")
    history = "нет данных" if recent is None else "\n".join(
        row["date"] + " · " + ACTIONS[row["action"]][0] + " · " +
        ("начата; результат неизвестен" if row["result"] == "started" else RESULTS.get(row["result"], "неизвестно"))
        for row in recent) or "Операций пока нет."
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
        "backup": "💾 Резервное копирование\n" + lines("backup", [("База", "db"), ("Конфигурация", "config")])
                  + "\nСтатус systemd, не доказательство восстановления копии.",
        "events": "🔔 BrickLab Events\n" + lines("events", [("В очереди", "pending"), ("Повторные попытки", "retrying"),
                     ("Доставлено (хранится до 30 дней)", "delivered"), ("Таймер", "timer")]),
        "audit": "🛡 Последние операции VPS\n" + history,
        "logs": "📋 Диагностика логов (последние 200 строк за 1 ч)\n" + lines("logs", [("Строки", "lines"), ("С ошибками", "errors"), ("С предупреждениями", "warnings")]) + "\nСодержимое логов не передаётся в Telegram.",
        "release": "🚀 Развёрнутая версия (checkout)\n" + value("release", "commit")
                     + "\nСмена версии и откат пока доступны только через проверенный VPS-процесс.",
    }
    text = bodies[page]
    if not data:
        text += "\n⚠ Снимок отсутствует или устарел. Статус неизвестен."
    buttons = [[{"text": label, "callback_data": "cc:" + key} for label, key in MENUS["home"][i:i+2]]
               for i in range(0, len(MENUS["home"]), 2)] if page == "home" else []
    buttons += [[{"text": label, "url": ORIGIN + path}] for label, path in LINKS.get(page, [])]
    if page == "release":
        buttons.append([{"text": "GitHub", "url": "https://github.com/Deenfoool/BrickLab-3D"}])
    if actions_enabled() and page in ("docker", "backup"):
        action = "restart" if page == "docker" else "backup"
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
                                 **render("docker" if action == "restart" else "backup", snapshot())})
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
