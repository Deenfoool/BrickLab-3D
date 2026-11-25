#!/usr/bin/env python3
"""Loopback-only read-only Mini App. Telegram initData verified on every request."""
import hashlib
import hmac
import http.server
import json
import os
import pathlib
import re
import time
import urllib.parse

ROOT = pathlib.Path(__file__).resolve().parent
SNAPSHOT = pathlib.Path("/run/bricklab-control/snapshot.json")
ORIGIN = "https://bricklab-3d.ru"
ASSETS = {"":("miniapp.html","text/html; charset=utf-8"),
          "app.js":("miniapp.js","text/javascript; charset=utf-8"),
          "app.css":("miniapp.css","text/css; charset=utf-8")}

def validate(raw, token, owner, now=None):
    try:
        if not isinstance(raw,str) or len(raw)>8192:
            return False
        pairs=urllib.parse.parse_qsl(raw,strict_parsing=True,max_num_fields=32)
        fields=dict(pairs)
        if len(fields)!=len(pairs):
            return False
        supplied=fields.pop("hash")
        if not re.fullmatch(r"[a-f0-9]{64}",supplied):
            return False
        check="\n".join(k+"="+v for k,v in sorted(fields.items()))
        secret=hmac.new(b"WebAppData",token.encode(),hashlib.sha256).digest()
        expected=hmac.new(secret,check.encode(),hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected,supplied):
            return False
        stamp=int(fields["auth_date"])
        age=(time.time() if now is None else now)-stamp
        user=json.loads(fields["user"])
        return -30<=age<=300 and type(user.get("id")) is int and user["id"]==owner
    except (ValueError,KeyError,TypeError,AttributeError,OverflowError):
        return False

def data():
    try:
        d=json.loads(SNAPSHOT.read_text())
        if not 0<=time.time()-float(d["timestamp"])<=180:
            return {}
        # Only aggregate sections, never account IDs, bug reports or audit IDs.
        return {k:d[k] for k in ("timestamp","vps","docker","stats","analytics","events","backup","release","logs","automation") if k in d}
    except (ValueError,KeyError,OSError,TypeError):
        return {}

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
    def do_GET(self):
        path=urllib.parse.urlsplit(self.path).path
        if path.startswith("/control/"):
            path=path[len("/control/"):]
        else:
            path=path.lstrip("/")
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
        server.serve_forever()

if __name__=="__main__":
    main()
