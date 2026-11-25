import importlib.util
import pathlib
import unittest
from unittest.mock import patch

scripts=pathlib.Path(__file__).resolve().parents[1]/"scripts"
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,scripts/path)
    mod=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod
r=load("recovery","bricklab-control-recovery.py")
c=load("control","bricklab-control.py")

class Recovery(unittest.TestCase):
    def test_requires_three_distinct_recent_failures(self):
        state={}
        for t in (10000,10000,10060,10120):
            state,ready=r.next_state(state,{"timestamp":t,"vps":{"api":"ошибка"},"docker":{"bricklab":"running unhealthy","sql":"OK"}},t)
            self.assertEqual(ready,t==10120)
        for t in (10180,10240,10300):
            state,ready=r.next_state(state,{"timestamp":t,"vps":{"api":"ошибка"},"docker":{"bricklab":"running unhealthy","sql":"OK"}},t)
            self.assertFalse(ready)
    def test_no_recovery_when_stopped_or_db_failed(self):
        for docker in ({"bricklab":"exited","sql":"OK"},{"bricklab":"running","sql":"ошибка"}):
            state,ready=r.next_state({"last_sample":10000,"failures":2},{"timestamp":10060,"vps":{"api":"ошибка"},"docker":docker},10060)
            self.assertFalse(ready)
            self.assertEqual(state["failures"],0)
    def test_github_exact_sha_and_cache(self):
        sha="a"*40
        c.GITHUB_CACHE={"until":0,"data":{}}
        with patch.object(c,"github_get",side_effect=[{"sha":sha},{"workflow_runs":[{"head_sha":sha,"conclusion":"success"},{"head_sha":"b"*40,"conclusion":"failure"}]}]) as get:
            self.assertEqual(c.github_status()["ci"],"success")
            self.assertEqual(c.github_status()["remote"],sha)
            self.assertEqual(get.call_count,2)
            self.assertIn(sha,get.call_args.args[0])

if __name__=="__main__":
    unittest.main()
