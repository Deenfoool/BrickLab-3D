import importlib.util
import pathlib
import unittest
from unittest.mock import patch
import json

path = pathlib.Path(__file__).resolve().parents[1] / "scripts/bricklab-events.py"
spec = importlib.util.spec_from_file_location("events", path)
events = importlib.util.module_from_spec(spec)
spec.loader.exec_module(events)
uid = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
def event(kind, payload, attempts=0):
    return {"id":7,"kind":kind,"payload":payload,"created_at":"2026-11-25T10:00:00+00:00","attempts":attempts}

class Events(unittest.TestCase):
    def test_links_and_privacy(self):
        m=events.message(event("registration",{"userId":uid,"verified":True,"total":5,"email":"private@example.invalid"}))
        self.assertNotIn("private@",str(m))
        self.assertIn("/#account/admin/user/"+uid,str(m))
        self.assertNotIn("parse_mode",m)
        m=events.message(event("build",{"buildId":uid,"profileId":uid,"title":"<bad>","author":"public","images":1,"parts":324,"revision":2}))
        self.assertIn("/#community/build/"+uid,str(m))
        self.assertIn("/image/0",str(m))
        self.assertIn("324",m["text"])
        self.assertIsNone(events.link("/#community/build/","https://evil.test"))
    def test_all_event_types(self):
        for kind in events.KINDS:
            with self.subTest(kind=kind):
                m=events.message(event(kind,{}))
                self.assertLess(len(m["text"]),4096)
                self.assertTrue(m["protect_content"])
        self.assertIn("Не реальная выручка",events.message(event("test_paid",{"kopecks":9900}))["text"])
    def test_failed_delivery_is_not_acknowledged(self):
        calls=[]
        def db(sql):
            calls.append(sql)
            return json.dumps(event("registration",{"userId":uid},2)) if "SELECT json_build_object" in sql else ""
        with patch.object(events,"db",side_effect=db),patch.object(events,"deliver",side_effect=events.DeliveryError("http_429",600)):
            self.assertEqual(events.run({"disabled":set()}),1)
        self.assertTrue(any("attempts=attempts+1" in q and "600*interval" in q for q in calls))
        self.assertFalse(any("SET sent_at=now()" in q for q in calls))
    def test_delivery_acknowledges_only_on_success(self):
        calls=[]
        def db(sql):
            calls.append(sql)
            return json.dumps(event("registration",{"userId":uid})) if "SELECT json_build_object" in sql else ""
        with patch.object(events,"db",side_effect=db),patch.object(events,"deliver"),patch.object(events.time,"sleep"):
            self.assertEqual(events.run({"disabled":set()}),0)
        self.assertTrue(any("SET sent_at=now(),last_error=NULL" in q for q in calls))
if __name__=="__main__":
    unittest.main()
