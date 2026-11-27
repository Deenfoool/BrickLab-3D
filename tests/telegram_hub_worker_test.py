import importlib.util
import io
import json
import pathlib
import unittest
import urllib.error
from unittest.mock import patch,MagicMock

path=pathlib.Path(__file__).resolve().parents[1]/"scripts/bricklab-hub-campaign-worker.py"
spec=importlib.util.spec_from_file_location("worker",path)
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class Worker(unittest.TestCase):
    def item(self,**kwargs):
        return {"chatId":"900002","body":"Test event",**kwargs}
    def test_invalid_recipient(self):
        with patch.object(m.urllib.request,"urlopen") as send:
            self.assertEqual(m.deliver("token",self.item(chatId="-100")),("failed",0))
            send.assert_not_called()
    def test_personal_footer(self):
        response=MagicMock()
        response.__enter__.return_value=io.BytesIO(b'{"ok":true}')
        with patch.object(m.urllib.request,"urlopen",return_value=response) as send:
            self.assertEqual(m.deliver("token",self.item(personal=True)),("sent",0))
            data=json.loads(send.call_args.args[0].data)
            self.assertEqual(data["chat_id"],900002)
            self.assertIn("События",data["text"])
            self.assertNotIn("Бонусы",data["text"])
    def test_ambiguous_network_failure_not_retry(self):
        with patch.object(m.urllib.request,"urlopen",side_effect=TimeoutError()):
            self.assertEqual(m.deliver("token",self.item()),("unknown",0))
    def test_explicit_rate_limit_retry(self):
        e=urllib.error.HTTPError("https://example.invalid",429,"rate limit",{},io.BytesIO(b'{"parameters":{"retry_after":33}}'))
        with patch.object(m.urllib.request,"urlopen",side_effect=e):
            self.assertEqual(m.deliver("token",self.item()),("retry",33))
if __name__=="__main__":
    unittest.main()
