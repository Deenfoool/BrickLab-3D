#!/usr/bin/env python3
"""Loopback-only Mini App with restricted jobs broker; owner initData checked per request."""
import hashlib
import hmac
import http.server
import json
import os
import pathlib
import re
import socket
import time
import urllib.parse
import urllib.request
import urllib.error

ROOT = pathlib.Path(__file__).resolve().parent
SNAPSHOT = pathlib.Path("/run/bricklab-control/snapshot.json")
ORIGIN = "https://bricklab-3d.ru"
ASSETS = {"":("miniapp.html","text/html; charset=utf-8"),
          "app.js":("miniapp.js","text/javascript; charset=utf-8"),
          "app.css":("miniapp.css","text/css; charset=utf-8"),
          "hub/":("hub.html","text/html; charset=utf-8"),
          "hub/app.js":("hub.js","text/javascript; charset=utf-8"),
          "hub/app.css":("hub.css","text/css; charset=utf-8")}

def telegram_identity(raw, token, now=None):
    try:
        if not isinstance(raw,str) or len(raw)>8192:
            return None
        pairs=urllib.parse.parse_qsl(raw,strict_parsing=True,max_num_fields=32)
        fields=dict(pairs)
        if len(fields)!=len(pairs):
            return None
        supplied=fields.pop("hash")
        if not re.fullmatch(r"[a-f0-9]{64}",supplied):
            return None
        check="\n".join(k+"="+v for k,v in sorted(fields.items()))
        secret=hmac.new(b"WebAppData",token.encode(),hashlib.sha256).digest()
        expected=hmac.new(secret,check.encode(),hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected,supplied):
            return None
        stamp=int(fields["auth_date"])
        age=(time.time() if now is None else now)-stamp
        user=json.loads(fields["user"])
        return user["id"] if -30<=age<=300 and type(user.get("id")) is int and 0<user["id"]<2**53 else None
    except (ValueError,KeyError,TypeError,AttributeError,OverflowError):
        return None

def validate(raw, token, owner, now=None):
    return telegram_identity(raw,token,now)==owner

def hub_request(key, ident, route, body=None):
    path="/api/telegram/"+route
    method="GET" if body is None else "POST"
    raw=b"" if body is None else body
    stamp=str(int(time.time()))
    check="\n".join((method,path,str(ident),stamp,hashlib.sha256(raw).hexdigest()))
    signature=hmac.new(key,check.encode(),hashlib.sha256).hexdigest()
    request=urllib.request.Request("http://127.0.0.1:8080"+path,data=body,method=method,headers={
        "X-BrickLab-Hub-Id":str(ident),"X-BrickLab-Hub-Time":stamp,
        "X-BrickLab-Hub-Signature":signature,"Content-Type":"application/json"})
    try:
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self,*args,**kwargs): return None
        opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect())
        with opener.open(request,timeout=8) as response:
            return response.status,response.read(262144)
    except urllib.error.HTTPError as e:
        with e:
            return e.code,e.read(4096)
    except (OSError,ValueError):
        return 503,b'{"error":"hub_unavailable"}'

def data():
    try:
        d=json.loads(SNAPSHOT.read_text())
        if not 0<=time.time()-float(d["timestamp"])<=180:
            return {}
        # Only aggregate sections, never account IDs, bug reports or audit IDs.
        return {k:d[k] for k in ("timestamp","vps","docker","stats","analytics","events","backup","release","logs","automation","upkeep","finance") if k in d}
    except (ValueError,KeyError,OSError,TypeError):
        return {}

def job_request(payload):
    try:
        with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as conn:
            conn.settimeout(10)
            conn.connect("/run/bricklab-control-jobs.sock")
            conn.sendall((json.dumps(payload)+"\n").encode())
            with conn.makefile("rb") as reader:
                raw=reader.readline(65537)
        if len(raw)>65536 or not raw.endswith(b"\n"): return {"error":"unavailable"}
        return json.loads(raw)
    except (OSError,ValueError):
        return {"error":"unavailable"}

class Handler(http.server.BaseHTTPRequestHandler):
    timeout = 10
    def log_message(self,*args):
        pass
    def reply(self,status,body,mime):
        self.send_response(status)
        self.send_header("Content-Type",mime)
        self.send_header("Content-Length",str(len(body)))
        self.send_header("Cache-Control","no-store")
        self.send_header("Referrer-Policy","no-referrer")
        self.send_header("X-Content-Type-Options","nosniff")
        self.send_header("Content-Security-Policy","default-src 'none'; script-src 'self' https://telegram.org; style-src 'self'; connect-src 'self'; frame-ancestors https://web.telegram.org https://*.telegram.org; base-uri 'none'; form-action 'none'")
        self.end_headers()
        self.wfile.write(body)
    def authorized(self):
        return validate(self.headers.get("X-Telegram-Init-Data",""),self.server.token,self.server.owner)
    def job_reply(self,payload):
        d=job_request(payload)
        return self.reply(409 if d.get("error") else 200,json.dumps(d,ensure_ascii=False).encode(),"application/json")
    def hub_reply(self,route,body=None):
        ident=telegram_identity(self.headers.get("X-Telegram-Init-Data",""),self.server.token)
        if ident is None:
            return self.reply(403,b'{"error":"unauthorized"}',"application/json")
        if not getattr(self.server,"hub_key",None):
            return self.reply(503,b'{"error":"hub_disabled"}',"application/json")
        status,data=hub_request(self.server.hub_key,ident,route,body)
        return self.reply(status,data,"application/json")
    def do_POST(self):
        route={"/control/hub/claim":"claim","/control/hub/preferences":"preferences","/control/hub/redeem":"redeem"}.get(self.path)
        admin_route={"/control/promo-create":"promo-create","/control/promo-disable":"promo-disable","/control/campaign-create":"campaign-create","/control/campaign-queue":"campaign-queue","/control/campaign-cancel":"campaign-cancel"}.get(self.path)
        if admin_route and not self.authorized():
            return self.reply(403,b'{"error":"unauthorized"}',"application/json")
        route=route or admin_route
        if route:
            if self.headers.get("Origin")!=ORIGIN:
                return self.reply(403,b'{"error":"unauthorized"}',"application/json")
            try:
                n=int(self.headers.get("Content-Length","0"))
                if not 0<n<=16384 or self.headers.get("Content-Type","").split(";")[0]!="application/json":
                    raise ValueError()
                raw=self.rfile.read(n)
                if len(raw)!=n: raise ValueError()
            except (OSError,ValueError):
                return self.reply(400,b'{"error":"invalid"}',"application/json")
            return self.hub_reply(route,raw)
        if urllib.parse.urlsplit(self.path).path!="/control/jobs":
            return self.reply(404,b"Not found","text/plain")
        if not self.authorized() or self.headers.get("Origin")!=ORIGIN:
            return self.reply(403,b'{"error":"unauthorized"}',"application/json")
        try:
            n=int(self.headers.get("Content-Length","0"))
            if not 0<n<=1024 or self.headers.get("Content-Type","").split(";")[0]!="application/json":
                raise ValueError()
            d=json.loads(self.rfile.read(n))
            if not isinstance(d,dict) or d.get("action") not in ("test","deploy"):
                raise ValueError()
        except (ValueError,OSError):
            return self.reply(400,b'{"error":"invalid"}',"application/json")
        return self.job_reply(d)
    def do_GET(self):
        path=urllib.parse.urlsplit(self.path).path
        if path.startswith("/control/"):
            path=path[len("/control/"):]
        else:
            path=path.lstrip("/")
        if path=="campaigns":
            if not self.authorized(): return self.reply(403,b'{"error":"unauthorized"}',"application/json")
            return self.hub_reply("campaigns")
        if path=="promos":
            if not self.authorized(): return self.reply(403,b'{"error":"unauthorized"}',"application/json")
            return self.hub_reply("promos")
        if path=="hub/api":
            return self.hub_reply("hub")
        if path=="role":
            ident=telegram_identity(self.headers.get("X-Telegram-Init-Data",""),self.server.token)
            if ident is None: return self.reply(403,b'{"error":"unauthorized"}',"application/json")
            return self.reply(200,json.dumps({"admin":ident==self.server.owner}).encode(),"application/json")
        if path in ("jobs","branches"):
            if not self.authorized():
                return self.reply(403,b'{"error":"unauthorized"}',"application/json")
            return self.job_reply({"action":"status" if path=="jobs" else "branches"})
        if path=="api":
            raw=self.headers.get("X-Telegram-Init-Data","")
            if not validate(raw,self.server.token,self.server.owner):
                return self.reply(403,b'{"error":"unauthorized"}',"application/json")
            d=data()
            return self.reply(200 if d else 503,json.dumps(d,ensure_ascii=False).encode(),"application/json")
        if path in ASSETS:
            name,mime=ASSETS[path]
            return self.reply(200,(ROOT/name).read_bytes(),mime)
        return self.reply(404,b"Not found","text/plain")

def main():
    conf=json.loads((pathlib.Path(os.environ["CREDENTIALS_DIRECTORY"])/"telegram.json").read_text())
    token=str(conf["token"])
    owner=int(conf["chat_id"])
    if owner<=0 or not re.fullmatch(r"[0-9]+:[A-Za-z0-9_-]{20,}",token):
        raise ValueError("private owner required")
    with http.server.HTTPServer(("127.0.0.1",8091),Handler) as server:
        server.token,server.owner=token,owner
        keypath=pathlib.Path(os.environ["CREDENTIALS_DIRECTORY"])/"hub.key"
        server.hub_key=None
        if keypath.is_file():
            raw=keypath.read_text().strip()
            if not re.fullmatch(r"[a-f0-9]{64}",raw): raise ValueError("Invalid Hub credential")
            server.hub_key=bytes.fromhex(raw)
        server.serve_forever()

if __name__=="__main__":
    main()
