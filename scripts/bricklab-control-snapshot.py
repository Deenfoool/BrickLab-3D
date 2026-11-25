#!/usr/bin/env python3
"""Fixed, read-only host collector. Publishes aggregate diagnostics, never raw logs/secrets."""
import json
import os
import pathlib
import re
import shutil
import subprocess
import time
import urllib.request

ROOT = "/opt/bricklab-cloud"
DEST = pathlib.Path("/run/bricklab-control/snapshot.json")

def run(args, sql=None):
    try:
        p = subprocess.run(args, input=sql, text=True, capture_output=True, cwd=ROOT, timeout=12)
        return p.stdout.strip() if p.returncode == 0 else None
    except (OSError, subprocess.TimeoutExpired):
        return None

def cpu():
    def sample():
        v = list(map(int, pathlib.Path("/proc/stat").read_text().splitlines()[0].split()[1:9]))
        return sum(v), v[3] + v[4]
    a, b = sample()
    time.sleep(1)
    c, d = sample()
    return str(round(100 * (1 - (d-b)/(c-a)))) + "%" if c > a else "нет данных"

def health(url):
    try:
        with urllib.request.urlopen(url, timeout=5) as r:
            return "OK" if r.status == 200 else "HTTP " + str(r.status)
    except (OSError, ValueError):
        return "ошибка"

def unit(name):
    raw = run(["systemctl", "show", name, "-p", "LoadState", "-p", "ActiveState",
               "-p", "Result", "-p", "ExecMainExitTimestamp"])
    if not raw:
        return "нет данных"
    values = dict(line.split("=", 1) for line in raw.splitlines() if "=" in line)
    if values.get("LoadState") != "loaded":
        return "не установлен"
    return " / ".join(values.get(k) or "—" for k in ("ActiveState", "Result", "ExecMainExitTimestamp"))

def query(sql):
    result = run(["docker", "compose", "exec", "-T", "db", "sh", "-c",
        'PGPASSWORD="$POSTGRES_PASSWORD" PGOPTIONS="-c default_transaction_read_only=on -c statement_timeout=5000" exec psql -X -qAt -v ON_ERROR_STOP=1 -h 127.0.0.1 -U bricklab_admin -d bricklab'], sql)
    try:
        return json.loads(result)
    except (TypeError, ValueError):
        return {}

def collect():
    data = {"timestamp": time.time()}
    vps = data["vps"] = {"cpu": cpu(), "api": health("http://127.0.0.1:8080/api/health"),
                         "https": health("https://bricklab-3d.ru/api/health")}
    mem = dict((k.rstrip(":"), int(v)) for k, v, *_ in
               (line.split() for line in pathlib.Path("/proc/meminfo").read_text().splitlines()))
    vps["ram"] = str(round(100*(1-mem["MemAvailable"]/mem["MemTotal"]))) + "%"
    disk = shutil.disk_usage(ROOT)
    vps["disk"] = f"{disk.free/2**30:.1f} GiB свободно / {disk.total/2**30:.1f} GiB"
    vps["uptime"] = str(int(float(pathlib.Path("/proc/uptime").read_text().split()[0])//3600)) + " ч"
    docker = data["docker"] = {}
    for service in ("bricklab", "db"):
        raw = run(["docker", "compose", "ps", "-a", "--format", "json", service])
        try:
            rows = json.loads(raw)
            if isinstance(rows, dict):
                rows = [rows]
        except (TypeError, ValueError):
            try:
                rows = [json.loads(line) for line in (raw or "").splitlines()]
            except ValueError:
                rows = []
        states = [str(row.get("State", "")) + " " + str(row.get("Health", "")) for row in rows]
        docker[service] = ", ".join(states)[:120] or "нет данных"
    docker["sql"] = "OK" if query("SELECT json_build_object('ok',true);").get("ok") else "ошибка"
    data["stats"] = query("""SELECT json_build_object(
        'users',(SELECT count(*) FROM bricklab.users),
        'verified',(SELECT count(*) FROM bricklab.users WHERE email_verified_at IS NOT NULL),
        'new_users',(SELECT count(*) FROM bricklab.users WHERE created_at>now()-interval '24 hours'),
        'profiles',(SELECT count(*) FROM bricklab.public_profiles),
        'builds',(SELECT count(*) FROM bricklab.public_builds),
        'build_reports',(SELECT count(*) FROM bricklab.community_build_reports WHERE resolved_at IS NULL),
        'comment_reports',(SELECT count(*) FROM bricklab.community_comment_reports WHERE resolved_at IS NULL),
        'bugs',(SELECT count(*) FROM bricklab.operator_bug_reports WHERE created_at>now()-interval '24 hours'));""")
    data["events"] = query("""SELECT json_build_object(
        'pending',count(*) FILTER (WHERE sent_at IS NULL),
        'retrying',count(*) FILTER (WHERE sent_at IS NULL AND attempts>0),
        'delivered',count(*) FILTER (WHERE sent_at IS NOT NULL AND last_error IS NULL))
        FROM bricklab.notification_outbox;""")
    data["events"]["timer"] = unit("bricklab-events.timer")
    data["backup"] = {"db": unit("bricklab-backup.service"), "config": unit("bricklab-config-backup.service")}
    commit = run(["git", "rev-parse", "HEAD"])
    data["release"] = {"commit": commit if commit and re.fullmatch(r"[0-9a-f]{40}", commit) else "нет данных"}
    raw = run(["docker", "compose", "logs", "--no-color", "--tail", "200", "--since", "1h", "bricklab"])
    if raw is not None:
        lines = raw.splitlines()
        data["logs"] = {"lines": len(lines), "errors": sum(bool(re.search(r"\b(?:error|fatal|exception)\b", line, re.I)) for line in lines),
                        "warnings": sum(bool(re.search(r"\b(?:warn|warning)\b", line, re.I)) for line in lines)}
    data["timestamp"] = time.time()
    return data

def main():
    data = collect()
    tmp = DEST.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False))
    os.chmod(tmp, 0o644)
    tmp.replace(DEST)

if __name__ == "__main__":
    main()
