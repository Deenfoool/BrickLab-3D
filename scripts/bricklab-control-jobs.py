#!/usr/bin/env python3
"""Fixed root-side job queue. The web service never receives Docker or root access."""
import fcntl
import json
import os
import pathlib
import pwd
import re
import secrets
import socket
import struct
import subprocess
import sys
import time
import urllib.request
from contextlib import contextmanager

STATE=pathlib.Path("/var/lib/bricklab-control-jobs")
ROOT="/opt/bricklab-cloud"
LIB="/usr/local/lib/bricklab-control"
UNIT="bricklab-control-job.service"
SHA=re.compile(r"[0-9a-f]{40}\Z")
BRANCH=re.compile(r"[A-Za-z0-9][A-Za-z0-9._/-]{0,119}\Z")
STAGES={
    "RELEASE HISTORY CHECK":"История обновлений",
    "UNIT AND HTTP TESTS":"JavaScript и HTTP",
    "TELEGRAM WORKER TESTS":"Telegram и Python",
    "ISOLATED DATABASE TESTS":"Изолированная PostgreSQL",
    "PRODUCTION BACKUPS":"Резервное копирование",
    "BUILD RELEASE":"Сборка образа",
    "APPLY MIGRATION":"Миграции",
    "START RELEASE":"Запуск и проверка API",
}
def run(*argv,timeout=20):
    return subprocess.run(argv,cwd=ROOT,stdin=subprocess.DEVNULL,
                          capture_output=True,text=True,timeout=timeout,check=True).stdout.strip()

def valid_branch(branch):
    return isinstance(branch,str) and BRANCH.fullmatch(branch) is not None and not any(
        x in branch for x in ("..","//","@{")) and all(
        part and not part.startswith(".") and not part.endswith((".lock",".")) for part in branch.split("/"))

def read():
    try:
        return json.loads((STATE/"job.json").read_text())
    except FileNotFoundError:
        return {}

def write(job):
    tmp=STATE/"job.tmp"
    tmp.write_text(json.dumps(job,ensure_ascii=False))
    tmp.replace(STATE/"job.json")

@contextmanager
def lock():
    with (STATE/"queue.lock").open("a") as f:
        fcntl.flock(f,fcntl.LOCK_EX)
        yield

def unit_active():
    try:
        value=run("systemctl","show",UNIT,"-p","ActiveState","--value")
    except (OSError,subprocess.SubprocessError):
        return None
    if value in ("active","activating","reloading","deactivating"): return True
    if value in ("inactive","failed"): return False
    return None

def current():
    job=read()
    if job.get("status") in ("queued","running") and unit_active() is False and time.time()-job.get("updated",0)>30:
        job.update(status="interrupted",updated=int(time.time()))
        write(job)
    return job

def branches():
    # Only the configured origin is queried. Do not fetch arbitrary URLs.
    raw=run("git","ls-remote","--heads","origin",timeout=15)
    result=[]
    for line in raw.splitlines():
        fields=line.split("\t")
        if len(fields)!=2 or not fields[1].startswith("refs/heads/"): continue
        sha,branch=fields[0],fields[1][11:]
        if SHA.fullmatch(sha) and valid_branch(branch):
            result.append({"branch":branch,"sha":sha})
    result.sort(key=lambda x:(x["branch"]!="feature/cloud-migration",x["branch"]))
    return result[:200]

def dispatch(request):
    if not isinstance(request,dict): return {"error":"invalid"}
    action=request.get("action")
    if action=="branches" and set(request)=={"action"}:
        return {"branches":branches()}
    if action=="status" and set(request)=={"action"}:
        with lock(): return {"job":current()}
    if action not in ("test","deploy") or set(request)!={"action","branch","sha","id"}:
        return {"error":"invalid"}
    branch,sha,ident=request["branch"],request["sha"],request["id"]
    if not valid_branch(branch) or not isinstance(sha,str) or not SHA.fullmatch(sha) or not isinstance(ident,str) or not re.fullmatch(r"[a-f0-9]{32}",ident):
        return {"error":"invalid"}
    if not (pathlib.Path("/etc/bricklab-backup/control-jobs.enabled").is_file()):
        return {"error":"disabled"}
    with lock():
        job=current()
        active=unit_active()
        if job.get("status") in ("queued","running") or active is not False:
            return {"error":"busy"}
        # Persist idempotency across process restarts; a repeated request cannot enqueue another job.
        ids=STATE/"requests"
        ids.mkdir(mode=0o700,exist_ok=True)
        try:
            fd=os.open(ids/ident,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
            os.close(fd)
        except FileExistsError:
            return {"error":"duplicate"}
        # Only the independently reviewed production SHA may deploy; branch testing is separate.
        if action=="deploy":
            if branch!="feature/cloud-migration" or job.get("action")!="test" or job.get("sha")!=sha or job.get("branch")!=branch or job.get("status")!="ok":
                return {"error":"test_required"}
            try:
                approval=pathlib.Path("/etc/bricklab-backup/control-release.approved")
                if approval.is_symlink() or approval.stat().st_uid!=0 or approval.stat().st_mode&0o077:
                    return {"error":"approval_required"}
                approved,expires=approval.read_text().split()
                if approved!=sha or not time.time()<=int(expires)<=time.time()+86400:
                    return {"error":"approval_required"}
            except (OSError,ValueError):
                return {"error":"approval_required"}
        now=int(time.time())
        job={"id":ident,"action":action,"branch":branch,"sha":sha,"status":"queued","stage":"Ожидание запуска","created":now,"updated":now}
        write(job)
        try:
            run("systemctl","start","--no-block",UNIT)
        except (OSError,subprocess.SubprocessError):
            job.update(status="failed",stage="Не удалось запустить службу",updated=int(time.time()))
            write(job)
            return {"error":"start_failed"}
        return {"job":job}

def notify(job):
    try:
        c=json.loads((pathlib.Path(os.environ["CREDENTIALS_DIRECTORY"])/"telegram.json").read_text())
        token,owner=c["token"],int(c["chat_id"])
        if owner<=0 or not re.fullmatch(r"[0-9]+:[A-Za-z0-9_-]{20,}",token): return
        text=("BrickLab · "+("Тесты" if job["action"]=="test" else "Деплой")+"\n"
              +job["branch"]+" · "+job["sha"][:12]+"\n"
              +("✅ Успешно" if job["status"]=="ok" else "❌ Не завершено: "+job["stage"]))
        if job.get("failed_tests"):
            text+="\nНе прошли проверки: "+str(job["failed_tests"])
        if job.get("exit_code") is not None:
            text+="\nКод завершения: "+str(job["exit_code"])
        payload={"chat_id":owner,"text":text,"protect_content":True}
        if os.environ.get("BRICKLAB_MINIAPP_ENABLED")=="1":
            payload["reply_markup"]={"inline_keyboard":[[{"text":"Control OS","web_app":{"url":"https://bricklab-3d.ru/control/"}}]]}
        req=urllib.request.Request("https://api.telegram.org/bot"+token+"/sendMessage",
                                   data=json.dumps(payload).encode(),headers={"Content-Type":"application/json"})
        with urllib.request.urlopen(req,timeout=15) as r:
            if not json.load(r).get("ok"): raise ValueError()
    except Exception:
        print("Job notification failed",file=sys.stderr)

def worker():
    with lock():
        job=read()
        if job.get("status")!="queued": return
        job.update(status="running",stage="Подготовка",updated=int(time.time()))
        write(job)
    if job["action"]=="test":
        args=["/bin/bash",LIB+"/deploy-community-vps.sh",job["sha"],"--test-only",job["branch"]]
    else:
        # The existing release script consumes approval and rechecks the exact remote SHA.
        args=["/bin/bash",LIB+"/bricklab-control-release.sh"]
    try:
        with (STATE/"last.log").open("wb") as log:
            # Logs stay root-only: candidate code output must not enter Telegram or the web.
            p=subprocess.Popen(args,cwd=ROOT,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,
                               env={"PATH":"/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin","HOME":"/root","LANG":"C.UTF-8"})
            total=0
            with p.stdout as stream:
                while True:
                    line=stream.readline(16384)
                    if not line: break
                    if total<8*1024*1024:
                        log.write(line[:8*1024*1024-total])
                        total+=len(line)
                    text=line.decode("utf-8","replace").strip()
                    stage=re.fullmatch(r"=== ([A-Z AND]+) ===",text)
                    count=re.fullmatch(r"# fail (\d{1,6})",text)
                    # Allow only fixed stage names and numeric TAP counters to leave the root log.
                    if stage and stage[1] in STAGES or count:
                        with lock():
                            if stage: job["stage"]=STAGES[stage[1]]
                            if count: job["failed_tests"]=int(count[1])
                            job["updated"]=int(time.time())
                            write(job)
            rc=p.wait()
        job.update(status="ok" if rc==0 else "failed",exit_code=rc)
    except (OSError,ValueError,subprocess.SubprocessError):
        job.update(status="failed")
    with lock():
        job["updated"]=int(time.time())
        write(job)
    notify(job)
    if job["status"]!="ok": raise SystemExit(1)

def broker():
    with socket.socket(fileno=os.dup(0)) as conn:
        conn.settimeout(20)
        try:
            _,uid,_=struct.unpack("3i",conn.getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,struct.calcsize("3i")))
            if uid!=pwd.getpwnam("bricklab-control").pw_uid: return
            with conn.makefile("rb") as reader:
                raw=reader.readline(1025)
            if not raw.endswith(b"\n") or len(raw)>1024:
                result={"error":"invalid"}
            else:
                result=dispatch(json.loads(raw))
        except (OSError,ValueError,subprocess.SubprocessError,KeyError,TypeError):
            result={"error":"unavailable"}
        conn.sendall((json.dumps(result,ensure_ascii=False)+"\n").encode())

if __name__=="__main__":
    os.umask(0o077)
    if os.getuid()!=0: raise SystemExit("root required")
    STATE.mkdir(mode=0o700,parents=True,exist_ok=True)
    if sys.argv[1:]==["worker"]: worker()
    elif sys.argv[1:]==["broker"]: broker()
    else: raise SystemExit("broker | worker")
