#!/usr/bin/env python3
"""Low-rate, opt-in campaign sender. No getUpdates, no duplicate retry on ambiguous send."""
import importlib.util
import json
import os
import pathlib
import time
import urllib.request
import urllib.error
import re
ROOT=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location("miniapp",ROOT/"bricklab-control-miniapp.py")
mini=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mini)

def deliver(token,item):
    chat=item.get("chatId")
    if not isinstance(chat,str) or not re.fullmatch(r"[1-9]\d{0,15}",chat): return "failed",0
    body=item.get("body")
    if not isinstance(body,str) or not 1<=len(body)<=2500: return "failed",0
    message={"chat_id":int(chat),"text":body+("\n\nНастройки событий: BrickLab Hub → События." if item.get("personal") else "\n\nНастройки рассылок: BrickLab Hub → Бонусы."),
             "reply_markup":{"inline_keyboard":[[{"text":"BrickLab Hub","web_app":{"url":"https://bricklab-3d.ru/control/hub/"}}]]}}
    req=urllib.request.Request("https://api.telegram.org/bot"+token+"/sendMessage",data=json.dumps(message).encode(),headers={"Content-Type":"application/json"})
    try:
        with urllib.request.urlopen(req,timeout=10) as r:
            return ("sent",0) if json.load(r).get("ok") is True else ("unknown",0)
    except urllib.error.HTTPError as e:
        with e:
            if e.code==429:
                try: delay=int(json.load(e).get("parameters",{}).get("retry_after",60))
                except (ValueError,TypeError): delay=60
                return "retry",max(5,min(delay,3600))
            if e.code in (400,403): return "failed",0
        return "unknown",0
    except (OSError,ValueError): return "unknown",0

def main():
    directory=pathlib.Path(os.environ["CREDENTIALS_DIRECTORY"])
    c=json.loads((directory/"telegram.json").read_text())
    owner=int(c["chat_id"]); token=c["token"]; key=bytes.fromhex((directory/"hub.key").read_text().strip())
    if owner<=0 or len(key)!=32 or not re.fullmatch(r"[0-9]+:[A-Za-z0-9_-]{20,}",token): raise ValueError("Invalid Hub credential")
    status,raw=mini.hub_request(key,owner,"personal-prepare",b"{}")
    personal_ready=status==200 and json.loads(raw).get("ok") is True
    empty=set()
    for i in range(20):
        kind="personal" if personal_ready and i%2==0 else "campaign"
        if kind in empty:
            kind="campaign" if kind=="personal" else "personal"
            if kind in empty or (kind=="personal" and not personal_ready): return
        status,raw=mini.hub_request(key,owner,kind+"-claim",b"{}")
        if status!=200:
            print("Campaign worker unavailable");return
        item=json.loads(raw).get("item")
        if not item:
            empty.add(kind)
            if len(empty)==2 or not personal_ready: return
            continue
        result,retry=deliver(token,item)
        payload=json.dumps({"attempt":item["attempt"],"result":result,"retry":retry}).encode()
        status,raw=mini.hub_request(key,owner,kind+"-finish",payload)
        if status!=200 or not json.loads(raw).get("ok"): return
        if result=="retry":return
        time.sleep(1)
if __name__=="__main__":main()
