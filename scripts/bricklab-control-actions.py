#!/usr/bin/env python3
"""Root-side fixed-action broker. No Telegram token, shell input, or raw output."""
import fcntl
import json
import os
import pwd
import re
import socket
import sqlite3
import struct
import subprocess
import sys
import time
import urllib.request

ROOT = "/opt/bricklab-cloud"
STATE = "/var/lib/bricklab-control-actions/audit.sqlite3"
LOCK = "/run/bricklab-deploy.lock"
LIMITS = {"restart": 600, "backup": 1800, "deploy": 1800}
APPROVAL = "/etc/bricklab-backup/control-release.approved"
COMMANDS = {
    "restart": ["/usr/bin/docker", "compose", "restart", "--timeout", "15", "bricklab"],
    "backup": ["/usr/bin/systemctl", "start", "bricklab-backup.service", "bricklab-config-backup.service"],
}

def run(argv, timeout=150):
    try:
        p = subprocess.run(argv, cwd=ROOT, stdin=subprocess.DEVNULL,
                           stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                           text=True, timeout=timeout, check=False)
        return p.returncode, p.stdout
    except (OSError, subprocess.TimeoutExpired):
        return None, ""

def healthy():
    for _ in range(12):
        try:
            with urllib.request.urlopen("http://127.0.0.1:8080/api/health", timeout=3) as r:
                if r.status == 200:
                    return True
        except (OSError, ValueError):
            pass
        time.sleep(2)
    return False

def execute(action):
    if action == "deploy":
        # The unit acquires the shared release lock itself; do not wait while holding it.
        if not os.path.isfile(APPROVAL):
            return "approval_required"
        rc, _ = run(["/usr/bin/systemctl", "start", "--no-block", "bricklab-control-release.service"], 15)
        return "queued" if rc == 0 else "failed" if rc is not None else "unknown"
    if action == "restart":
        rc, out = run(["/usr/bin/docker", "compose", "ps", "--status", "running", "-q", "bricklab"], 10)
        if rc != 0 or not out.strip():
            return "not_running"
    rc, _ = run(COMMANDS[action])
    if rc is None:
        return "unknown"
    if rc != 0:
        return "failed"
    if action == "restart" and not healthy():
        return "health_failed"
    return "ok"

def dispatch(request, state=STATE, lock=LOCK, precondition=None, source="telegram"):
    if source not in ("telegram","recovery"):
        return "invalid"
    if not isinstance(request, dict) or set(request) != {"action", "id"}:
        return "invalid"
    action, ident = request["action"], request["id"]
    if not isinstance(action, str) or action not in LIMITS or not isinstance(ident, str) or not re.fullmatch(r"[a-f0-9]{24}", ident):
        return "invalid"
    with open(lock, "a") as guard:
        try:
            fcntl.flock(guard, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return "busy"
        if precondition is not None and not precondition():
            return "not_running"
        with sqlite3.connect(state, timeout=5) as db:
            db.execute("CREATE TABLE IF NOT EXISTS audit (id TEXT PRIMARY KEY, action TEXT NOT NULL, started INTEGER NOT NULL, result TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'telegram')")
            if "source" not in {r[1] for r in db.execute("PRAGMA table_info(audit)")}:
                db.execute("ALTER TABLE audit ADD COLUMN source TEXT NOT NULL DEFAULT 'telegram'")
            now = int(time.time())
            if db.execute("SELECT 1 FROM audit WHERE id=?", (ident,)).fetchone():
                return "duplicate"
            last = db.execute("SELECT max(started) FROM audit WHERE action=?", (action,)).fetchone()[0]
            if last is not None and now-last < LIMITS[action]:
                return "cooldown"
            db.execute("INSERT INTO audit(id,action,started,result,source) VALUES (?,?,?,?,?)", (ident, action, now, "started", source))
            db.commit()
            print("Control action started: " + action + " " + ident, file=sys.stderr, flush=True)
            try:
                result = execute(action)
            except Exception:
                result = "unknown"
            db.execute("UPDATE audit SET result=? WHERE id=?", (result, ident))
            db.commit()
            print("Control action finished: " + action + " " + ident + " " + result, file=sys.stderr, flush=True)
            return result

def main():
    with socket.socket(fileno=os.dup(0)) as conn:
        conn.settimeout(5)
        try:
            _, uid, _ = struct.unpack("3i", conn.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, struct.calcsize("3i")))
            if uid != pwd.getpwnam("bricklab-control").pw_uid:
                return
            with conn.makefile("rb") as reader:
                raw = reader.readline(257)
                if not raw.endswith(b"\n") or len(raw) > 256:
                    result = "invalid"
                else:
                    result = dispatch(json.loads(raw))
            conn.sendall((result + "\n").encode())
        except (OSError, ValueError, KeyError, sqlite3.Error):
            print("Control broker request failed", file=sys.stderr)

if __name__ == "__main__":
    main()
