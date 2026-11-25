import importlib.util
import pathlib
import tempfile
import unittest
from unittest.mock import patch

path = pathlib.Path(__file__).resolve().parents[1] / "scripts/bricklab-control.py"
spec = importlib.util.spec_from_file_location("control", path)
control = importlib.util.module_from_spec(spec)
spec.loader.exec_module(control)

def msg(uid=42, typ="private", chat=42):
    return {"chat": {"type": typ, "id": chat}, "from": {"id": uid}, "text": "/menu", "message_id": 1}

class Control(unittest.TestCase):
    def test_owner_only(self):
        for m in (msg(43), msg(42, "group"), msg(42, chat=43)):
            calls = []
            control.handle({"message": m}, 42, lambda *args: calls.append(args))
            self.assertEqual(calls, [])
        calls = []
        control.handle({"message": msg()}, 42, lambda *args: calls.append(args))
        self.assertEqual(calls[0][0], "sendMessage")
        self.assertTrue(calls[0][1]["protect_content"])

    def test_callback_allowlist_and_owner(self):
        for uid, data in ((43, "cc:vps"), (42, "cc:restart"), (42, "cc:../etc")):
            calls = []
            control.handle({"callback_query": {"id":"x","from":{"id":uid},"message":msg(),"data":data}},
                           42, lambda *args: calls.append(args))
            self.assertEqual(calls, [])
        calls = []
        control.handle({"callback_query":{"id":"x","from":{"id":42},"message":msg(),"data":"cc:vps"}},
                       42, lambda *args: calls.append(args))
        self.assertEqual([c[0] for c in calls], ["answerCallbackQuery","editMessageText"])

    def test_group_config_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            p = pathlib.Path(d)/"conf"
            p.write_text('{"token":"123:abcdefghijklmnopqrstuvwxyz","chat_id":"-42"}')
            with self.assertRaises(ValueError):
                control.config(p)

    def test_stale_snapshot(self):
        with tempfile.TemporaryDirectory() as d:
            p = pathlib.Path(d)/"snapshot"
            p.write_text('{"timestamp":1}')
            with patch.object(control,"SNAPSHOT",p):
                self.assertEqual(control.snapshot(),{})
        for page in control.PAGES:
            result=control.render(page,{})
            self.assertIn("устарел",result["text"])
            self.assertLess(len(result["text"]),4096)
            for row in result["reply_markup"]["inline_keyboard"]:
                for button in row:
                    if "callback_data" in button:
                        self.assertIn(button["callback_data"][3:],control.PAGES)
                    else:
                        self.assertTrue(button["url"].startswith("https://"))

if __name__ == "__main__":
    unittest.main()
