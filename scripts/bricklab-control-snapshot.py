#!/usr/bin/env python3
"""Fixed, read-only host collector. Publishes aggregate diagnostics, never raw logs/secrets."""
import json
import grp
import os
import pathlib
import re
import shutil
import sqlite3
import datetime
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

def audit():
    path = pathlib.Path("/var/lib/bricklab-control-actions/audit.sqlite3")
    if not path.exists():
        return {"recent": []}
    try:
        with sqlite3.connect("file:"+str(path)+"?mode=ro", uri=True, timeout=2) as db:
            source = "source" if "source" in {r[1] for r in db.execute("PRAGMA table_info(audit)")} else "'telegram'"
            rows = db.execute("SELECT action,started,result,"+source+" FROM audit ORDER BY started DESC,rowid DESC LIMIT 8").fetchall()
        return {"recent": [{"action": a, "date": datetime.datetime.fromtimestamp(t, datetime.timezone.utc).strftime("%d.%m %H:%M UTC"), "result": r, "source": "recovery" if origin=="recovery" else "telegram"}
                           for a,t,r,origin in rows if a in ("restart","backup","deploy","maintenance_on","maintenance_off") and r in ("started","ok","failed","unknown","not_running","health_failed","queued","approval_required")]}
    except (sqlite3.Error, ValueError, OSError, OverflowError):
        return {}

def collect():
    data = {"timestamp": time.time()}
    vps = data["vps"] = {"cpu": cpu(), "api": health("http://127.0.0.1:8080/api/health"),
                         "https": health("https://bricklab-3d.ru/api/health")}
    mem = dict((k.rstrip(":"), int(v)) for k, v, *_ in
               (line.split() for line in pathlib.Path("/proc/meminfo").read_text().splitlines()))
    vps["ram_percent"] = round(100*(1-mem["MemAvailable"]/mem["MemTotal"]))
    vps["ram"] = str(vps["ram_percent"]) + "%"
    disk = shutil.disk_usage(ROOT)
    vps["disk_free_percent"] = round(100*disk.free/disk.total,1)
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
    data["analytics"] = query("""SELECT json_build_object(
        'days',(SELECT json_agg(x ORDER BY x.day) FROM
          (SELECT d::date AS day,
             (SELECT count(*) FROM bricklab.users u WHERE u.created_at >= d AND u.created_at < d+interval '1 day') AS users,
             (SELECT count(*) FROM bricklab.public_builds b WHERE b.published_at >= d AND b.published_at < d+interval '1 day') AS builds
           FROM generate_series(date_trunc('day',now())-interval '6 days',date_trunc('day',now()),interval '1 day') d) x),
        'likes',(SELECT count(*) FROM bricklab.community_likes),
        'views',(SELECT count(*) FROM bricklab.community_events WHERE kind='view'),
        'downloads',(SELECT count(*) FROM bricklab.community_events WHERE kind='download'),
        'follows',(SELECT count(*) FROM bricklab.community_follows),
        'parts',(SELECT coalesce(sum(part_count),0) FROM bricklab.public_builds),
        'categories',(SELECT coalesce(json_agg(x),'[]'::json) FROM
           (SELECT category, count(*) AS count FROM bricklab.public_builds GROUP BY category ORDER BY count DESC LIMIT 8) x)
        );""")
    data["admin"] = query("""SELECT json_build_object(
        'users', (SELECT coalesce(json_agg(x),'[]'::json) FROM
          (SELECT id, created_at::date AS day, email_verified_at IS NOT NULL AS verified, blocked_at IS NOT NULL AS blocked
           FROM bricklab.users ORDER BY created_at DESC,id LIMIT 5) x),
        'builds', (SELECT coalesce(json_agg(x),'[]'::json) FROM
          (SELECT public_id AS id, part_count AS parts, published_at::date AS day FROM bricklab.public_builds ORDER BY published_at DESC,public_id LIMIT 5) x),
        'bugs', (SELECT coalesce(json_agg(x),'[]'::json) FROM
          (SELECT id, created_at::date AS day FROM bricklab.operator_bug_reports ORDER BY created_at DESC,id LIMIT 5) x)
        );""")
    data["events"] = query("""SELECT json_build_object(
        'pending',count(*) FILTER (WHERE sent_at IS NULL),
        'retrying',count(*) FILTER (WHERE sent_at IS NULL AND attempts>0),
        'delivered',count(*) FILTER (WHERE sent_at IS NOT NULL AND last_error IS NULL))
        FROM bricklab.notification_outbox;""")
    data["events"]["timer"] = unit("bricklab-events.timer")
    data["backup"] = {"db": unit("bricklab-backup.service"), "config": unit("bricklab-config-backup.service")}
    try:
        stamp, status = pathlib.Path("/var/lib/bricklab-control-verification/result").read_text().split()
        if status in ("running","ok","failed"):
            data["backup"]["verification"] = status + " · " + datetime.datetime.fromtimestamp(int(stamp),datetime.timezone.utc).strftime("%d.%m.%Y %H:%M UTC")
    except (OSError,ValueError,OverflowError):
        pass
    commit = run(["git", "rev-parse", "HEAD"])
    data["release"] = {"commit": commit if commit and re.fullmatch(r"[0-9a-f]{40}", commit) else "нет данных"}
    data["release"]["job"] = unit("bricklab-control-release.service")
    try:
        approved = pathlib.Path("/etc/bricklab-backup/control-release.approved").read_text().strip().split()
        if len(approved)==2 and re.fullmatch(r"[a-f0-9]{40}",approved[0]) and int(approved[1])>time.time():
            data["release"]["approved"] = approved[0]
    except (OSError,ValueError):
        pass
    tracking = run(["git", "rev-parse", "--verify", "refs/remotes/origin/feature/cloud-migration"])
    if tracking and re.fullmatch(r"[0-9a-f]{40}", tracking):
        data["release"]["tracking"] = tracking
        behind = run(["git", "rev-list", "--count", "HEAD..refs/remotes/origin/feature/cloud-migration"])
        if behind is not None and behind.isdigit():
            data["release"]["behind"] = int(behind)
    status = run(["git", "status", "--porcelain", "--untracked-files=no"])
    if status is not None:
        data["release"]["worktree"] = "есть изменения" if status else "чисто (отслеживаемые файлы)"
    raw = run(["docker", "compose", "logs", "--no-color", "--tail", "200", "--since", "1h", "bricklab"])
    if raw is not None:
        lines = raw.splitlines()
        data["logs"] = {"lines": len(lines), "errors": sum(bool(re.search(r"\b(?:error|fatal|exception)\b", line, re.I)) for line in lines),
                        "warnings": sum(bool(re.search(r"\b(?:warn|warning)\b", line, re.I)) for line in lines)}
    data["automation"] = {"recovery": unit("bricklab-control-recovery.timer"), "maintenance": "пауза восстановления" if pathlib.Path("/etc/bricklab-backup/control-recovery.pause").exists() else "нет паузы"}
    ready=pathlib.Path("/etc/bricklab-backup/control-maintenance.enabled").is_file()
    active=pathlib.Path("/run/bricklab-control-maintenance/enabled").is_file()
    data["automation"].update(maintenance_ready=ready,maintenance_active=active)
    if active:
        data["automation"]["maintenance"]="публичный сайт на техработах"
    elif ready:
        data["automation"]["maintenance"]="публичный сайт открыт"
    data["audit"] = audit()
    data["timestamp"] = time.time()
    return data

def main():
    data = collect()
    tmp = DEST.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False))
    os.chown(tmp, 0, grp.getgrnam("bricklab-control").gr_gid)
    os.chmod(tmp, 0o640)
    tmp.replace(DEST)

if __name__ == "__main__":
    main()
