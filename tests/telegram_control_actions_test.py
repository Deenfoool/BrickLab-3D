import importlib.util
import pathlib
import tempfile
import unittest
from unittest.mock import patch
import sqlite3
import fcntl

path=pathlib.Path(__file__).resolve().parents[1]/"scripts/bricklab-control-actions.py"
spec=importlib.util.spec_from_file_location("actions",path)
actions=importlib.util.module_from_spec(spec)
spec.loader.exec_module(actions)

class Actions(unittest.TestCase):
    def test_allowlist_and_audit(self):
        with tempfile.TemporaryDirectory() as d, patch.object(actions,"execute",return_value="ok") as execute:
            db, lock = str(pathlib.Path(d)/"audit"),str(pathlib.Path(d)/"lock")
            def req(action, id):
                return actions.dispatch({"action":action,"id":id},db,lock)
            self.assertEqual(req("restart; id","a"*24),"invalid")
            self.assertEqual(req("restart","bad"),"invalid")
            self.assertEqual(req("restart","a"*24),"ok")
            self.assertEqual(req("restart","a"*24),"duplicate")
            self.assertEqual(req("restart","b"*24),"cooldown")
            self.assertEqual(req("backup","c"*24),"ok")
            self.assertEqual(execute.call_count,2)
            with sqlite3.connect(db) as c:
                self.assertEqual(c.execute("select count(*) from audit where result='ok'").fetchone()[0],2)
            with open(lock,"a") as guard:
                fcntl.flock(guard,fcntl.LOCK_EX)
                self.assertEqual(req("backup","d"*24),"busy")
    def test_restart_never_starts_stopped_app(self):
        with patch.object(actions,"run",return_value=(0,"")) as run:
            self.assertEqual(actions.execute("restart"),"not_running")
            self.assertEqual(run.call_count,1)
    def test_health_failure_and_timeout(self):
        with patch.object(actions,"run",side_effect=[(0,"id"),(0,"")]),patch.object(actions,"healthy",return_value=False):
            self.assertEqual(actions.execute("restart"),"health_failed")
        with patch.object(actions,"run",return_value=(None,"")):
            self.assertEqual(actions.execute("backup"),"unknown")

if __name__=="__main__":
    unittest.main()
