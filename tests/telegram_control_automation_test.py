import importlib.util
import pathlib
import tempfile
import unittest
from unittest.mock import patch

path=pathlib.Path(__file__).resolve().parents[1]/"scripts/bricklab-control.py"
spec=importlib.util.spec_from_file_location("control",path)
control=importlib.util.module_from_spec(spec)
spec.loader.exec_module(control)

class Automation(unittest.TestCase):
    def test_alert_debounce_recovery_and_restart(self):
        with tempfile.TemporaryDirectory() as d, patch.dict(control.os.environ,{"STATE_DIRECTORY":d}):
            calls=[]
            call=lambda *args: calls.append(args)
            control.update_preferences("on")
            def sample(t, api):
                control.check_alerts(42,call,{"timestamp":t,"vps":{"api":api}})
            sample(1,"ошибка")
            sample(1,"ошибка")
            self.assertEqual(calls,[])
            sample(2,"ошибка")
            self.assertEqual(len(calls),1)
            sample(3,"ошибка")
            self.assertEqual(len(calls),1)
            sample(4,"OK")
            sample(5,"OK")
            self.assertEqual(len(calls),2)
            self.assertIn("Восстановлено",calls[-1][1]["text"])
    def test_idempotent_enable(self):
        with tempfile.TemporaryDirectory() as d, patch.dict(control.os.environ,{"STATE_DIRECTORY":d}):
            control.update_preferences("on")
            control.update_preferences("on")
            self.assertTrue(control.preferences()["enabled"])
            control.update_preferences("off")
            control.update_preferences("off")
            self.assertFalse(control.preferences()["enabled"])
    def test_quiet_and_missing_values(self):
        with tempfile.TemporaryDirectory() as d, patch.dict(control.os.environ,{"STATE_DIRECTORY":d}):
            calls=[]
            control.update_preferences("on")
            control.update_preferences("quiet")
            for t in (1,2):
                control.check_alerts(42,lambda *a:calls.append(a),{"timestamp":t,"vps":{"ram_percent":95}})
            self.assertEqual(calls,[])
            control.update_preferences("resume")
            control.check_alerts(42,lambda *a:calls.append(a),{"timestamp":3,"vps":{"ram_percent":95}})
            self.assertEqual(len(calls),1)
            control.check_alerts(42,lambda *a:calls.append(a),{"timestamp":4})
            self.assertEqual(len(calls),1)
    def test_private_link_metadata(self):
        uid="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
        view=control.render("bugs",{"admin":{"bugs":[{"id":uid,"day":"2026-11-25","summary":"secret"}]}})
        self.assertIn(uid,str(view))
        self.assertNotIn("secret",str(view))
        view=control.render("users",{"admin":{"users":[{"id":"https://evil.test","email":"private@example.test"}]}})
        self.assertNotIn("evil.test",str(view))
        self.assertNotIn("private@",str(view))
    def test_preferences_owner_only(self):
        with tempfile.TemporaryDirectory() as d, patch.dict(control.os.environ,{"STATE_DIRECTORY":d}):
            control.handle({"callback_query":{"id":"x","from":{"id":43},"message":{"chat":{"id":42,"type":"private"},"message_id":1},"data":"pref:on"}},42,lambda *a:None)
            self.assertFalse(control.preferences().get("enabled"))

if __name__=="__main__":
    unittest.main()
