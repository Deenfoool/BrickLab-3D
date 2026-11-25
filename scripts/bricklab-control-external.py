#!/usr/bin/env python3
"""Run on an independent host. Send a Telegram alert after two failed probes."""
import json
import os
import pathlib
import re
import stat
import time
import urllib.request

URL="https://bricklab-3d.ru/api/health"
CONFIG=pathlib.Path("/etc/bricklab-external/telegram.json")
STATE=pathlib.Path("/var/lib/bricklab-external/state.json")

def config():
    with CONFIG.open() as fp:
        s=os.fstat(fp.fileno())
        if s.st_uid!=0 or stat.S_IMODE(s.st_mode)&0o077:
            raise ValueError("unsafe config")
        d=json.load(fp)
    if not re.fullmatch(r"[0-9]+:[A-Za-z0-9_-]{20,}",str(d.get("token",""))) or not re.fullmatch(r"[1-9][0-9]{0,18}",str(d.get("chat_id",""))):
        raise ValueError("invalid config")
    return d

def probe():
    try:
        with urllib.request.urlopen(URL,timeout=10) as r:
            d=json.loads(r.read(4096))
            return r.status==200 and d.get("status")=="ok" and d.get("service")=="bricklab-3d"
    except (OSError,ValueError,AttributeError):
        return False

def step(previous,ok):
    state=dict(previous)
    old=state.get("last")
    state["last"]=ok
    state["count"]=min(2,state.get("count",0)+1) if old==ok else 1
    announced=state.get("announced",True)
    notify=state["count"]>=2 and announced!=ok
    return state,notify

def send(c,ok):
    body={"chat_id":c["chat_id"],"text":"✅ BrickLab доступен извне" if ok else "⚠ BrickLab недоступен с независимого сервера (2 проверки)","protect_content":True}
    req=urllib.request.Request("https://api.telegram.org/bot"+c["token"]+"/sendMessage",data=json.dumps(body).encode(),headers={"Content-Type":"application/json"})
    with urllib.request.urlopen(req,timeout=12) as r:
        return json.load(r).get("ok") is True

def main():
    try:
        c=config()
        try:
            previous=json.loads(STATE.read_text())
        except (OSError,ValueError):
            previous={}
        ok=probe()
        state,notify=step(previous,ok)
        if notify and send(c,ok):
            state["announced"]=ok
        tmp=STATE.with_suffix(".tmp")
        tmp.write_text(json.dumps(state))
        os.chmod(tmp,0o600)
        tmp.replace(STATE)
    except Exception as e:
        # Exception messages can contain Telegram credentials.
        print("External monitor failed: "+type(e).__name__)
        return 1
    return 0

if __name__=="__main__":
    raise SystemExit(main())
