#!/usr/bin/env python3
"""Opt-in host recovery: one guarded restart after three bad snapshots, at most hourly."""
import importlib.util
import json
import pathlib
import secrets
import time
import urllib.request

DIR = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("actions",DIR/"bricklab-control-actions.py")
actions = importlib.util.module_from_spec(spec)
spec.loader.exec_module(actions)
SNAPSHOT = pathlib.Path("/run/bricklab-control/snapshot.json")
STATE = pathlib.Path("/var/lib/bricklab-control-recovery/state.json")
PAUSE = pathlib.Path("/etc/bricklab-backup/control-recovery.pause")

def read(path):
    try:
        d=json.loads(path.read_text())
        return d if isinstance(d,dict) else {}
    except (OSError,ValueError):
        return {}

def write(data):
    tmp=STATE.with_suffix(".tmp")
    tmp.write_text(json.dumps(data))
    tmp.replace(STATE)

def next_state(previous, snapshot, now):
    state=dict(previous)
    stamp=snapshot.get("timestamp")
    if type(stamp) not in (int,float) or not 0 <= now-stamp <= 180:
        state["failures"]=0
        return state,False
    old=state.get("last_sample",0)
    if stamp <= old:
        return state,False
    v=snapshot.get("vps",{})
    d=snapshot.get("docker",{})
    running=str(d.get("bricklab","")).split()[:1]==["running"]
    bad=v.get("api")=="ошибка" and d.get("sql")=="OK" and running
    state["failures"]=(state.get("failures",0) if 0<stamp-old<=180 else 0)+1 if bad else 0
    state["last_sample"]=stamp
    ready=state["failures"]>=3 and now-state.get("last_attempt",0)>=3600
    if ready:
        state["last_attempt"]=now
        state["failures"]=0
    return state,ready

def still_unhealthy():
    if PAUSE.exists():
        return False
    rc,out=actions.run(["/usr/bin/docker","compose","ps","--status","running","-q","bricklab"],10)
    if rc!=0 or not out.strip():
        return False
    rc,_=actions.run(["/usr/bin/docker","compose","exec","-T","db","pg_isready","-h","127.0.0.1","-U","bricklab_admin","-d","bricklab"],10)
    if rc!=0:
        return False
    try:
        with urllib.request.urlopen("http://127.0.0.1:8080/api/health",timeout=3) as response:
            return response.status!=200
    except (OSError,ValueError):
        return True

def main():
    state=read(STATE)
    if PAUSE.exists():
        state["failures"]=0
        write(state)
        return
    state,ready=next_state(state,read(SNAPSHOT),time.time())
    write(state)
    if ready:
        # The action broker shares the deploy lock, rechecks under that lock,
        # and records the request before it touches Docker.
        result=actions.dispatch({"action":"restart","id":secrets.token_hex(12)},precondition=still_unhealthy)
        print("Automatic recovery: "+result,flush=True)

if __name__=="__main__":
    main()
