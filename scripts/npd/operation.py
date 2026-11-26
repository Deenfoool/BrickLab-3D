"""One operation using pinned yookassa-to-mynalog's MoyNalogAPI.
No scheduler, no YooKassa keys, no database credentials in this container.
Input and output are JSON on stdin/stdout. Never log credentials or tax data.
"""
import asyncio
from datetime import datetime
from decimal import Decimal
import json
import logging
import re
import sys

from nalog_api import MoyNalogAPI

logging.disable(logging.CRITICAL)
UUID = re.compile(r"[A-Za-z0-9_-]{1,80}", re.ASCII)
ORDER = re.compile(r"[0-9a-f-]{36}", re.ASCII)


async def execute(data, factory=MoyNalogAPI):
    job = data["job"]
    action = job["action"]
    if (job.get("environment") != "live" or job.get("verified_test") is not False
            or action not in ("issue", "reconcile_issue", "cancel", "reconcile_cancel")
            or not ORDER.fullmatch(job["id"]) or not ORDER.fullmatch(job["payment_id"])):
        raise ValueError("unverified_live_order")
    date = datetime.fromisoformat(job["operation_at"].replace("Z", "+00:00"))
    if date.tzinfo is None:
        raise ValueError("missing_timezone")
    cents = job["amount_kopecks"]
    if type(cents) is not int or not 1 <= cents <= 10000000:
        raise ValueError("invalid_amount")
    if not re.fullmatch(r"[0-9]{12}", data["inn"]) or not data["password"]:
        raise ValueError("invalid_credentials")
    # A stable unique name permits read-only recovery after an ambiguous POST.
    # Keep the suffix intact even when a product title is long.
    suffix = " [BL:" + job["id"] + "]"
    title = " ".join(job["title"].split())[:128-len(suffix)] + suffix
    amount = Decimal(cents) / Decimal(100)
    receipt = job.get("receipt_uuid")
    if action in ("cancel", "reconcile_cancel") and (job["status"] != "refunded" or not receipt or not UUID.fullmatch(receipt)):
        raise ValueError("invalid_refund")
    if action == "issue" and job["status"] != "succeeded":
        return {"result": "safe_release"}
    api = factory(login=data["inn"], password=data["password"], auth_method="password")
    try:
        try:
            await api.authenticate()
        except Exception:
            return {"result": "safe_release" if action in ("issue", "cancel") else "unknown", "category": "auth"}
        if action == "issue":
            # Upstream defaults to individual customers. Only enable after
            # confirming BrickLab sells solely to individuals.
            receipt = await api.add_income(title, amount, date)
            if not receipt:
                return {"result": "unknown", "category": "issue_needs_reconciliation"}
        elif action == "reconcile_issue":
            receipt = await api.find_income(title, amount, date)
            if not receipt:
                return {"result": "unknown", "category": "issue_needs_reconciliation"}
        elif action == "cancel":
            if not await api.cancel_income(receipt):
                return {"result": "unknown", "category": "cancel_needs_reconciliation"}
        elif await api.get_income_status(receipt, date) != "cancelled":
            return {"result": "unknown", "category": "cancel_needs_reconciliation"}
        if not isinstance(receipt, str) or not UUID.fullmatch(receipt):
            return {"result": "unknown", "category": "invalid_receipt_response"}
        return {"result": "issued" if action in ("issue", "reconcile_issue") else "canceled",
                "receipt_uuid": receipt, "operation_at": date.isoformat(),
                "url": "https://lknpd.nalog.ru/api/v1/receipt/" + data["inn"] + "/" + receipt + "/print"}
    finally:
        await api.close()


if __name__ == "__main__":
    try:
        print(json.dumps(asyncio.run(execute(json.load(sys.stdin)))))
    except Exception:
        # An unexpected failure may have happened AFTER a successful write.
        print(json.dumps({"result": "unknown", "category": "worker_failure"}))
