import importlib.util
import pathlib
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location("jobs",pathlib.Path(__file__).resolve().parents[1]/"scripts/bricklab-control-jobs.py")
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class Jobs(unittest.TestCase):
    def test_branch_validation(self):
        self.assertTrue(m.valid_branch("feature/control-os"))
        for bad in ("--help","https://example.com","feature/../x","a//b","a/.hidden","a.lock","a;id","a\nb","a/"):
            self.assertFalse(m.valid_branch(bad),bad)
    def test_request_validation(self):
        self.assertEqual(m.dispatch({"action":"shell"}),{"error":"invalid"})
        self.assertEqual(m.dispatch({"action":"test","branch":"--bad","sha":"a"*40,"id":"b"*32}),{"error":"invalid"})
        self.assertEqual(m.dispatch({"action":"status","extra":1}),{"error":"invalid"})
    def test_branch_list(self):
        with patch.object(m,"run",return_value="a"*40+"\trefs/heads/feature/control-os\n"+"b"*40+"\trefs/heads/feature/cloud-migration"):
            self.assertEqual(m.branches()[0]["branch"],"feature/cloud-migration")
    def test_interrupted_job(self):
        with tempfile.TemporaryDirectory() as d,patch.object(m,"STATE",pathlib.Path(d)),patch.object(m,"unit_active",return_value=False):
            m.write({"status":"running","updated":0})
            self.assertEqual(m.current()["status"],"interrupted")
    def test_deploy_requires_test(self):
        with tempfile.TemporaryDirectory() as d,patch.object(m,"STATE",pathlib.Path(d)),patch.object(m,"unit_active",return_value=False),patch.object(pathlib.Path,"is_file",return_value=True):
            result=m.dispatch({"action":"deploy","branch":"feature/control-os","sha":"a"*40,"id":"b"*32})
            self.assertEqual(result,{"error":"test_required"})
            self.assertEqual(m.dispatch({"action":"deploy","branch":"feature/control-os","sha":"a"*40,"id":"b"*32}),{"error":"duplicate"})

if __name__=="__main__": unittest.main()
