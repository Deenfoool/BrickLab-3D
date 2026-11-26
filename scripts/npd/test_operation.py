import asyncio
from datetime import datetime, timezone
from decimal import Decimal
import unittest
from operation import execute

class Fake:
    writes = []
    receipts = {}
    failure = False
    auth_failure = False
    def __init__(self, **kwargs): pass
    async def authenticate(self):
        if self.auth_failure: raise RuntimeError()
    async def close(self): pass
    async def add_income(self, title, amount, date):
        self.writes.append(("issue", title, amount))
        self.receipts[title] = "abc123"
        return None if self.failure else "abc123"
    async def find_income(self, title, amount, date):
        return self.receipts.get(title)
    async def cancel_income(self, receipt):
        self.writes.append(("cancel", receipt))
        self.receipts["canceled"] = True
        return not self.failure
    async def get_income_status(self, receipt, date):
        return "cancelled" if self.receipts.get("canceled") else "active"

class FiscalTest(unittest.TestCase):
    def setUp(self):
        Fake.writes.clear()
        Fake.receipts.clear()
        Fake.failure = False
        Fake.auth_failure = False
        self.data = {"inn": "000000000000", "password": "fixture",
          "job": {"id": "30000000-0000-4000-8000-000000000001",
                  "payment_id": "40000000-0000-4000-8000-000000000001",
                  "environment": "live", "verified_test": False,
                  "action": "issue", "status": "succeeded", "title": "Aurora Lab",
                  "amount_kopecks": 19900, "operation_at": "2026-11-26T07:00:00Z"}}
    def execute(self, **changes):
        self.data["job"].update(changes)
        return asyncio.run(execute(self.data, Fake))
    def test_test_payment_rejected_before_auth(self):
        for key, value in [("verified_test", True), ("environment", "test"), ("verified_test", None)]:
            original = self.data["job"][key]
            with self.assertRaises(ValueError): self.execute(**{key: value})
            self.data["job"][key] = original
        self.assertEqual(Fake.writes, [])
    def test_lost_response_never_repeats_write(self):
        Fake.failure = True
        self.assertEqual(self.execute()["result"], "unknown")
        self.assertEqual(len(Fake.writes), 1)
        result = self.execute(action="reconcile_issue")
        self.assertEqual(result["result"], "issued")
        self.assertTrue(result["url"].endswith("/abc123/print"))
        self.assertEqual(Fake.writes[0][2], Decimal("199"))
        self.assertEqual(len(Fake.writes), 1)
        self.assertEqual(self.execute(action="cancel", status="refunded", receipt_uuid="abc123")["result"], "unknown")
        self.assertEqual(self.execute(action="reconcile_cancel")["result"], "canceled")
        self.assertEqual(len(Fake.writes), 2)
    def test_auth_failure_can_release_new_claim(self):
        Fake.auth_failure = True
        self.assertEqual(self.execute()["result"], "safe_release")
        self.assertEqual(self.execute(action="reconcile_issue")["result"], "unknown")
        self.assertEqual(Fake.writes, [])
    def test_refunded_order_never_issues_new_receipt(self):
        self.assertEqual(self.execute(status="refunded")["result"], "safe_release")
        self.assertEqual(Fake.writes, [])

if __name__ == "__main__":
    unittest.main(verbosity=2)
