#!/usr/bin/env python3
"""Root-owned scheduled upkeep. Never prune volumes, containers or arbitrary images."""
import datetime as dt
import fcntl
import json
import math
import os
import pathlib
import re
import shutil
import sqlite3
import subprocess
import sys
import time
import urllib.request
from contextlib import closing, contextmanager

STATE = pathlib.Path("/var/lib/bricklab-control-upkeep")
SNAPSHOT = pathlib.Path("/run/bricklab-control/snapshot.json")
LOCK = "/run/bricklab-deploy.lock"
ROOT = "/opt/bricklab-cloud"
MSK = dt.timezone(dt.timedelta(hours=3))
TAG = re.compile(r"bricklab-cloud-bricklab:rollback-[0-9a-f]{7,40}\Z")
IMAGE = re.compile(r"sha256:[0-9a-f]{64}\Z")
KEEP = 3

def command(*args, timeout=30):
    return subprocess.run(args, cwd=ROOT, check=True, capture_output=True,
                          text=True, timeout=timeout).stdout.strip()

def read(path, default):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return default

def write(path, value):
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False))
    tmp.replace(path)

@contextmanager
def locked(path):
    with open(path, "a") as f:
        fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield

def inventory():
    tags = command("docker", "image", "ls", "--format", "{{.Repository}}:{{.Tag}}")
    rows = []
    for tag in sorted(set(tags.splitlines())):
        if not TAG.fullmatch(tag):
            continue
        raw = command("docker", "image", "inspect", "--format", "{{.Id}} {{.Created}}", tag)
        image, created = raw.split(maxsplit=1)
        if not IMAGE.fullmatch(image):
            raise ValueError("Unexpected image ID")
        # Docker Created is the fallback for legacy rollback tags; new ones have release timestamps.
        stamp = dt.datetime.fromisoformat(created[:19] + "+00:00").timestamp()
        rows.append((tag, image, stamp))
    ids = command("docker", "ps", "-aq").splitlines()
    used = set()
    for cid in ids:
        image = command("docker", "inspect", "--format", "{{.Image}}", cid)
        if not IMAGE.fullmatch(image):
            raise ValueError("Unexpected container image")
        used.add(image)
    return rows, used

def plan(rows, used, history):
    # Prefer the recorded release timestamp; tie-break conservatively at the cutoff.
    ranked = sorted(((history.get(tag, {}).get("at", stamp)
                      if history.get(tag, {}).get("image") == image else stamp, tag, image)
                     for tag, image, stamp in rows), reverse=True)
    cutoff = ranked[KEEP-1][0] if len(ranked) >= KEEP else float("-inf")
    return [tag for stamp, tag, image in ranked if stamp < cutoff and image not in used]

def disk_metrics():
    docker_root = command("docker", "info", "--format", "{{.DockerRootDir}}")
    if not os.path.isabs(docker_root):
        raise ValueError("Invalid Docker root")
    result, devices = {}, set()
    for name, path in (("app", ROOT), ("docker", docker_root)):
        dev = os.stat(path).st_dev
        if dev in devices:
            continue
        devices.add(dev)
        d = shutil.disk_usage(path)
        # Match df convention: unavailable reserved blocks are not user free space.
        total = d.used + d.free
        if not total:
            raise ValueError("Empty disk")
        result[name] = {"used_percent": round(100*d.used/total, 1),
                        "free_bytes": d.free}
    return result

def cleanup(apply=False):
    with locked(LOCK):
        rows, used = inventory()
        history = read(STATE/"rollbacks.json", {})
        targets = plan(rows, used, history)
        report = {"at": int(time.time()), "mode": "apply" if apply else "preview",
                  "rollback_count": len(rows), "candidates": targets, "removed": [],
                  "status": "preview" if not apply else "running"}
        write(STATE/"cleanup.json", report)
        if not apply:
            print(json.dumps(report, ensure_ascii=False))
            return
        before = {}
        try:
            before = disk_metrics()
            # Default builder prune: only dangling build cache. No -a, no volume/image prune.
            command("docker", "builder", "prune", "--force", "--filter", "until=168h", timeout=600)
            for tag in targets:
                # Revalidate under the shared lock. Never force removal.
                current, active = inventory()
                if tag not in plan(current, active, history):
                    continue
                command("docker", "image", "rm", tag)
                report["removed"].append(tag)
            report["status"] = "ok"
        except (OSError, ValueError, subprocess.SubprocessError):
            report["status"] = "failed"
            raise
        finally:
            try:
                after = disk_metrics()
                report["free_delta_bytes"] = sum(after[k]["free_bytes"]-v["free_bytes"]
                    for k,v in before.items() if k in after)
                report["rollback_count"] = len(inventory()[0])
            except (OSError, ValueError, subprocess.SubprocessError):
                report["status"] = "failed"
                raise
            finally:
                write(STATE/"cleanup.json", report)

def record(tag, image):
    # Called by release runner while it holds LOCK, only after successful health checks.
    if not TAG.fullmatch(tag) or not IMAGE.fullmatch(image):
        raise ValueError("Invalid rollback reference")
    history = read(STATE/"rollbacks.json", {})
    history[tag] = {"at": time.time(), "image": image}
    write(STATE/"rollbacks.json", history)

def level(percent, previous=0):
    if percent >= 90: return 90
    if percent >= 85: return 85
    if percent >= 75: return 75
    if percent < 70: return 0
    return 75 if previous else 0

def number(value):
    return value if type(value) in (float,int) and math.isfinite(value) and 0<=value<=100 else None

def metric_sample(d, disks, now):
    fresh = type(d.get("timestamp")) in (int,float) and 0<=now-d["timestamp"]<=180
    v = d.get("vps",{}) if fresh else {}
    cpu = v.get("cpu","")
    return (now, number(float(cpu[:-1])) if re.fullmatch(r"\d{1,3}%",str(cpu)) else None,
            number(v.get("ram_percent")), max(x["used_percent"] for x in disks.values()),
            1 if v.get("https")=="OK" else 0 if v.get("https")=="ошибка" else None)

def send(text):
    conf = json.loads((pathlib.Path(os.environ["CREDENTIALS_DIRECTORY"])/"telegram.json").read_text())
    token, owner = conf["token"], int(conf["chat_id"])
    if owner<=0 or not re.fullmatch(r"[0-9]+:[A-Za-z0-9_-]{20,}", token):
        raise ValueError("Invalid credentials")
    payload=json.dumps({"chat_id":owner,"text":text,"protect_content":True}).encode()
    req=urllib.request.Request("https://api.telegram.org/bot"+token+"/sendMessage",
                               data=payload,headers={"Content-Type":"application/json"})
    try:
        with urllib.request.urlopen(req,timeout=15) as response:
            if not json.load(response).get("ok"):
                raise RuntimeError("Telegram rejected message")
    except (OSError, ValueError):
        raise RuntimeError("Telegram delivery failed") from None

def period(now):
    today = dt.datetime.fromtimestamp(now,MSK)
    due = (today-dt.timedelta(days=today.weekday())).replace(hour=9,minute=0,second=0,microsecond=0)
    if today<due: due-=dt.timedelta(days=7)
    return int(due.timestamp())

def report(db, due, d, disks, last):
    row=db.execute("SELECT count(*), avg(cpu), max(ram), max(disk), sum(https), count(https) FROM samples WHERE ts>=? AND ts<?",
                   (due-7*86400,due)).fetchone()
    count,cpu,ram,disk,ok,checks=row
    def pct(x): return "нет данных" if x is None else f"{x:.1f}%"
    return "\n".join(("BrickLab · еженедельный отчёт VPS",
        "Период: "+dt.datetime.fromtimestamp(due-7*86400,MSK).strftime("%d.%m %H:%M")+" — "+dt.datetime.fromtimestamp(due,MSK).strftime("%d.%m %H:%M")+" МСК",
        f"Измерений: {count} (ожидается около 2016)",
        "Средний CPU: "+pct(cpu),"Пиковая RAM: "+pct(ram),"Пиковый диск: "+pct(disk),
        "HTTPS с VPS: "+(f"{100*ok/checks:.2f}% успешных проверок ({checks})" if checks else "нет данных"),
        "Диск сейчас: "+", ".join(f"{k} {v['used_percent']}%" for k,v in disks.items()),
        "PostgreSQL: "+str(d.get("docker",{}).get("sql","нет данных")),
        "Последний бэкап БД: "+str(d.get("backup",{}).get("db","нет данных")),
        "Последняя очистка: "+str(last.get("status","нет данных")),
        "Rollback-образов (последняя инвентаризация): "+str(last.get("rollback_count","нет данных"))))

def sample():
    now=int(time.time())
    disks=disk_metrics()
    d=read(SNAPSHOT,{})
    row=metric_sample(d,disks,now)
    last=read(STATE/"cleanup.json",{})
    state=read(STATE/"notify.json",{})
    with closing(sqlite3.connect(STATE/"metrics.sqlite3")) as db, db:
        db.execute("CREATE TABLE IF NOT EXISTS samples(ts INTEGER PRIMARY KEY,cpu REAL,ram REAL,disk REAL,https INTEGER)")
        db.execute("INSERT OR REPLACE INTO samples VALUES(?,?,?,?,?)",row)
        db.execute("DELETE FROM samples WHERE ts<?",(now-35*86400,))
        db.commit()
        due=period(now)
        previous=state.get("levels",{})
        levels={k:level(v["used_percent"],previous.get(k,0)) for k,v in disks.items()}
        write(STATE/"status.json",{"at":now,"disks":disks,"cleanup":last,
                                  "weekly_sent_at":state.get("weekly_sent_at"),"samples":db.execute("SELECT count(*) FROM samples WHERE ts>=?",(now-7*86400,)).fetchone()[0]})
        for key,new in levels.items():
            old=previous.get(key,0)
            if new>old or (old and new==0):
                send(f"BrickLab · диск {key}: {disks[key]['used_percent']}% — "+("норма" if not new else f"порог {new}%"))
            # Keep highest announced level until recovery below 70%.
            previous[key]=max(old,new) if new else 0
            state["levels"]=previous
            write(STATE/"notify.json",state)
        if due>state.get("weekly_sent_at",0):
            count=db.execute("SELECT count(*) FROM samples WHERE ts<? AND ts>=?",(due,due-7*86400)).fetchone()[0]
            if count:
                send(report(db,due,d,disks,last))
                state["weekly_sent_at"]=due
                write(STATE/"notify.json",state)
                status=read(STATE/"status.json",{})
                status["weekly_sent_at"]=due
                write(STATE/"status.json",status)

def main():
    if os.getuid()!=0: raise SystemExit("root required")
    os.umask(0o077)
    STATE.mkdir(mode=0o700,parents=True,exist_ok=True)
    try:
        if sys.argv[1:]==["sample"]:
            with locked(str(STATE/"sample.lock")): sample()
        elif sys.argv[1:]==["preview"]: cleanup()
        elif sys.argv[1:]==["cleanup"]:
            cleanup(apply=(pathlib.Path("/etc/bricklab-backup/upkeep-cleanup.enabled").is_file()))
        elif len(sys.argv)==4 and sys.argv[1]=="record": record(*sys.argv[2:])
        else: raise SystemExit("sample | preview | cleanup | record TAG IMAGE")
    except BlockingIOError:
        print("Skipped: another operation is active")
    except (OSError, ValueError, RuntimeError, sqlite3.Error, subprocess.SubprocessError):
        # Do not expose command arguments or Telegram credentials.
        print("Upkeep operation failed; inspect local services and Docker state",file=sys.stderr)
        raise SystemExit(1)

if __name__=="__main__":
    main()
