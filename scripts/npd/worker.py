#!/usr/bin/env python3
"""Trusted local operator worker. No public HTTP endpoint or second webhook."""
import base64
from datetime import datetime
from decimal import Decimal
import fcntl
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
from urllib.request import Request, build_opener, HTTPRedirectHandler

ROOT = Path(__file__).resolve().parents[2]
PRIVATE = Path("/etc/bricklab-npd")
IMAGE = "bricklab-npd:3.4.1"
PSQL = ["docker", "compose", "exec", "-T", "db", "psql", "-U", "bricklab_admin", "-d", "bricklab", "-X", "-qAt", "-v", "ON_ERROR_STOP=1"]


def query(sql, **variables):
    args = list(PSQL)
    for k, v in variables.items():
        args += ["-v", k + "=" + str(v)]
    return subprocess.check_output(args, input=sql, cwd=ROOT, text=True, timeout=25, stderr=subprocess.DEVNULL).strip()


def private_config():
    path = PRIVATE / "settings.json"
    if not path.exists():
        return None
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o077:
        raise ValueError("unsafe_secret_permissions")
    config = json.loads(path.read_text())
    if config.get("enabled") is not True:
        return None
    if config.get("individual_buyers_only") is not True:
        raise ValueError("buyer_type_unconfirmed")
    date = datetime.fromisoformat(config["since"])
    if date.tzinfo is None:
        raise ValueError("invalid_start_date")
    return config


def env_value(text, name):
    values = re.findall(r"(?m)^" + re.escape(name) + r"=([^\r\n]*)$", text)
    if len(values) != 1:
        return ""
    return values[0].strip()


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def verified_payment(job, shop, secret):
    if not re.fullmatch(r"[0-9a-f-]{36}", job["payment_id"]):
        raise ValueError("invalid_payment_id")
    auth = base64.b64encode((shop + ":" + secret).encode()).decode()
    request = Request("https://api.yookassa.ru/v3/payments/" + job["payment_id"],
                      headers={"Authorization": "Basic " + auth, "Accept": "application/json"})
    with build_opener(NoRedirect()).open(request, timeout=15) as response:
        p = json.load(response)
    amount = Decimal(str(p["amount"]["value"])) * 100
    if (p.get("test") is not False or p.get("id") != job["payment_id"]
            or p.get("paid") is not True or p.get("status") != "succeeded"
            or p.get("metadata", {}).get("order_id") != job["id"]
            or p["amount"]["currency"] != "RUB" or amount != job["amount_kopecks"]):
        raise ValueError("payment_verification_failed")
    refunded = p.get("refunded_amount")
    if refunded is None:
        refunded_amount = Decimal(0)
    else:
        if refunded["currency"] != "RUB":
            raise ValueError("refund_currency_mismatch")
        refunded_amount = Decimal(str(refunded["value"])) * 100
    if job["action"] in ("cancel", "reconcile_cancel") and refunded_amount != amount:
        raise ValueError("refund_verification_failed")
    if job["action"] == "issue" and refunded_amount != 0:
        raise ValueError("refund_requires_review")
    if job["action"] == "reconcile_issue" and refunded_amount not in (Decimal(0), amount):
        raise ValueError("partial_refund_requires_review")
    captured = p.get("captured_at")
    if not isinstance(captured, str) or datetime.fromisoformat(captured.replace("Z", "+00:00")).tzinfo is None:
        raise ValueError("missing_capture_time")
    return {**job, "environment": "live", "verified_test": False, "operation_at": captured}


def run():
    cfg = private_config()
    if not cfg:
        print("NPD automation disabled")
        return
    text = (ROOT / ".env").read_text()
    shop = env_value(text, "BRICKLAB_YOOKASSA_LIVE_SHOP_ID")
    secret = env_value(text, "BRICKLAB_YOOKASSA_LIVE_SECRET")
    test_shop = env_value(text, "BRICKLAB_YOOKASSA_TEST_SHOP_ID")
    if (not re.fullmatch(r"[0-9]{1,20}", shop) or shop == test_shop
            or not re.fullmatch(r"live_[A-Za-z0-9_*-]{11,}", secret)):
        print("NPD automation disabled: live credentials unavailable")
        return
    # Keep servicing already paid LIVE orders even if checkout is switched off.
    raw = query("SELECT row_to_json(j) FROM bricklab.commerce_claim_fiscal(:'since'::timestamptz) j;", since=cfg["since"])
    if not raw:
        return
    job = json.loads(raw)
    def release():
        if job["action"] in ("issue", "cancel"):
            query("SELECT bricklab.commerce_fiscal_release(:'id'::uuid, :'action');", id=job["id"], action=job["action"])
    try:
        verified = verified_payment(job, shop, secret)
    except Exception:
        release()
        print("NPD provider verification failed; review required", file=sys.stderr)
        return
    # No secrets in command arguments or container environment; only stdin.
    cmd = ["docker", "run", "--rm", "-i", "--user", "1000:1000",
           "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
           "--read-only", "--tmpfs", "/tmp:rw,mode=1777",
           "--entrypoint", "python", IMAGE, "-c", (ROOT / "scripts/npd/operation.py").read_text()]
    try:
        output = subprocess.check_output(cmd, input=json.dumps({"job": verified, "inn": cfg["inn"], "password": cfg["password"]}),
                                         text=True, stderr=subprocess.DEVNULL, timeout=150)
        result = json.loads(output)
    except Exception:
        print("NPD response uncertain; read-only reconciliation scheduled", file=sys.stderr)
        return
    state = result.get("result")
    if state == "safe_release":
        release()
        print("NPD authentication unavailable; retry later", file=sys.stderr)
        return
    if state not in ("issued", "canceled"):
        print("NPD response uncertain; read-only reconciliation scheduled", file=sys.stderr)
        return
    action = "issue" if job["action"] in ("issue", "reconcile_issue") else "cancel"
    if state != ("issued" if action == "issue" else "canceled"):
        raise ValueError("unexpected_result")
    ok = query("SELECT bricklab.commerce_fiscal_finish(:'id'::uuid, :'action', :'receipt', :'url', :'at'::timestamptz);",
               id=job["id"], action=action, receipt=result["receipt_uuid"], url=result["url"], at=result["operation_at"])
    if ok != "t":
        raise ValueError("fiscal_commit_failed")
    print("NPD " + state + " BL-" + str(job["order_number"]).zfill(6))


if __name__ == "__main__":
    if os.geteuid() != 0:
        sys.exit("Must run as root on trusted VPS")
    # Global host lock prevents two timer/manual invocations racing.
    os.umask(0o077)
    with open("/run/lock/bricklab-npd.lock", "w") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            sys.exit(0)
        try:
            run()
        except Exception:
            # Never print exceptions that may include SQL, response bodies or credentials.
            sys.exit("NPD worker failed; inspect fiscal queue")
