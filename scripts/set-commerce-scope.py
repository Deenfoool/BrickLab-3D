#!/usr/bin/env python3
"""Stage a checkout-only scope change. Never creates a payment, never restarts services."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime

ROOT = Path(__file__).resolve().parents[1]
if ROOT != Path("/opt/bricklab-cloud") or os.geteuid() != 0:
    sys.exit("Run as root from /opt/bricklab-cloud")
if len(sys.argv) != 2 or sys.argv[1] not in ("closed", "pilot", "public"):
    sys.exit("Usage: set-commerce-scope.py closed|pilot|public")
scope = sys.argv[1]
env = ROOT / ".env"
text = env.read_text()
def value(key):
    vals = re.findall(r"(?m)^[ \t]*"+re.escape(key)+r"[ \t]*=([^\r\n]*)$", text)
    if len(vals) > 1:
        sys.exit("Duplicate configuration: "+key)
    return vals[0].strip() if vals else ""

def require(ok, message):
    if not ok:
        sys.exit(message)

def count(sql):
    result = subprocess.run(["docker","compose","exec","-T","db","psql","-U","bricklab_admin","-d","bricklab","-X","-qAt","-v","ON_ERROR_STOP=1"], cwd=ROOT, input=sql, text=True, capture_output=True, timeout=30)
    require(result.returncode == 0 and result.stdout.strip().isdigit(), "Fiscal database check failed")
    return int(result.stdout.strip())

if scope != "closed":
    require(value("BRICKLAB_COMMERCE_MODE") == "live", "Live mode is not configured")
    require(value("BRICKLAB_YOOKASSA_LIVE_ENABLED") == "true", "Live provider disabled")
    require(value("BRICKLAB_NPD_RECEIPTS_READY") == "true", "NPD readiness not confirmed")
    shop = value("BRICKLAB_YOOKASSA_LIVE_SHOP_ID")
    require(bool(re.fullmatch(r"\d{1,20}",shop)) and shop != value("BRICKLAB_YOOKASSA_TEST_SHOP_ID"), "Invalid live shop")
    require(bool(re.fullmatch(r"live_[A-Za-z0-9_*-]{11,}",value("BRICKLAB_YOOKASSA_LIVE_SECRET"))), "Invalid live secret")
    require(all(value(k) for k in ("BRICKLAB_MAIL_USER","BRICKLAB_MAIL_KEY","BRICKLAB_MAIL_FROM")), "Receipt mail configuration incomplete")
    try:
        manifest = json.loads(Path("/var/lib/bricklab-commerce-private/approval.json").read_text())
        hashes = [hashlib.sha256((Path("/var/lib/bricklab-legal")/(name+".html")).read_bytes()).hexdigest() for name in ("offer","privacy","refund","requisites")]
        require(manifest.get("approved") is True and hashes == [manifest["files"][name] for name in ("offer","privacy","refund","requisites")], "Legal approval mismatch")
        offer_version = hashlib.sha256(":".join(hashes).encode()).hexdigest()
        require(value("BRICKLAB_COMMERCE_FULL_CATALOG_OFFER_VERSION") == offer_version, "Full catalog approval mismatch")
    except (OSError, ValueError, KeyError, TypeError):
        sys.exit("Legal approval not readable")
    if value("BRICKLAB_INSTRUCTIONS_RELEASE") == "true":
        audit = value("BRICKLAB_PRIVATE_INSTRUCTION_AUDIT")
        require(bool(re.fullmatch(r"/app/private-instructions/[A-Za-z0-9_-]+\.json",audit)), "Invalid private instruction audit path")
        checked = subprocess.run(["docker","compose","exec","-T","bricklab","node","server/check-instruction-audit.js",audit,offer_version],cwd=ROOT,capture_output=True,text=True,timeout=30)
        require(checked.returncode == 0, "Reviewed instruction manifest and current-offer approval required")
        print("Instruction catalog validated:",checked.stdout.strip())
    require(subprocess.run(["systemctl","is-active","--quiet","bricklab-npd.timer"]).returncode == 0, "NPD timer not active")
    require(count("SELECT count(*) FROM bricklab.schema_migrations WHERE version=\'128_commerce_admin_audit_export\';") == 1, "Commerce audit migration not installed")
    if scope == "public":
        require(value("BRICKLAB_LIVE_CHECKOUT_SCOPE") == "pilot", "Complete the pilot before opening public checkout")
        # offer_version is a locally computed SHA-256, never raw user input.
        verified = count(f"""SELECT count(*) FROM bricklab.commerce_orders o
         WHERE environment='live' AND provider='yookassa' AND status='refunded'
         AND offer_version='{offer_version}' AND accepted_at IS NOT NULL AND NOT partial_refund_seen
         AND EXISTS (SELECT 1 FROM bricklab.admin_accounts a WHERE a.user_id=o.user_id)
         AND paid_at IS NOT NULL AND refunded_at IS NOT NULL AND receipt_status='issued'
         AND receipt_delivery_sent_at IS NOT NULL AND fiscal_state='canceled'
         AND receipt_correction_pending=false AND fiscal_receipt_uuid IS NOT NULL;""")
        require(verified > 0, "No completed live payment -> NPD receipt -> mail -> refund -> cancellation in database")
        unresolved = count("""SELECT count(*) FROM bricklab.commerce_orders WHERE environment='live'
        AND (status='pending' OR fiscal_state IN ('issue_unknown','cancel_unknown') OR receipt_correction_pending OR partial_review_pending
        OR (status='succeeded' AND (receipt_status<>'issued' OR (NOT partial_refund_seen AND receipt_delivery_sent_at IS NULL))));""")
        require(unresolved == 0, "Unresolved live orders or receipts; review before launch")
        audit_open = count("""SELECT count(*) FROM bricklab.commerce_admin_audit a
         WHERE a.environment='live' AND a.phase='started' AND a.action<>'finance_export'
         AND NOT EXISTS (SELECT 1 FROM bricklab.commerce_admin_audit b WHERE b.request_id=a.request_id AND b.phase IN ('succeeded','failed'));""")
        require(audit_open == 0, "Unresolved administrative audit events; reconcile before launch")
    prompt = "Confirm operator review and actual receipt delivery/refund checks. Type PUBLIC: " if scope == "public" else "Real money, administrators only. Type PILOT: "
    require(input(prompt).strip() == scope.upper(), "Canceled")
backup = Path("/var/backups/bricklab-commerce")
backup.mkdir(mode=0o700,parents=True,exist_ok=True)
backup.chmod(0o700)
target = backup / ("env-scope-"+datetime.now().strftime("%Y%m%d-%H%M%S-%f"))
shutil.copyfile(env,target)
target.chmod(0o600)
updated = re.sub(r"(?m)^[ \t]*BRICKLAB_LIVE_CHECKOUT_SCOPE[ \t]*=.*\n?", "", text).rstrip("\n")+"\nBRICKLAB_LIVE_CHECKOUT_SCOPE="+scope+"\n"
fd, tmp = tempfile.mkstemp(prefix=".env-scope-",dir=ROOT)
try:
    with os.fdopen(fd,"w") as f:
        f.write(updated)
        f.flush()
        os.fsync(f.fileno())
    os.chmod(tmp,0o600)
    os.replace(tmp,env)
finally:
    if os.path.exists(tmp):
        os.unlink(tmp)
print("Staged checkout scope:",scope)
print("No payment created. Recreate only the bricklab service to apply.")
print("Keep provider credentials and NPD worker running for existing orders.")
