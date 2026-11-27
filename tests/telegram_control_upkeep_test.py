import importlib.util
import pathlib
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location("upkeep",pathlib.Path(__file__).resolve().parents[1]/"scripts/bricklab-control-upkeep.py")
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class Upkeep(unittest.TestCase):
    def test_retention_and_active(self):
        rows=[("bricklab-cloud-bricklab:rollback-"+str(i)*7,"sha256:"+str(i)*64,i) for i in range(1,7)]
        self.assertEqual(m.plan(rows,{rows[0][1]},{}),[rows[2][0],rows[1][0]])
    def test_protect_ties(self):
        rows=[(str(i),str(i),1) for i in range(5)]
        self.assertEqual(m.plan(rows,set(),{}),[])
    def test_release_order_and_retag(self):
        rows=[(str(i),str(i),i) for i in range(5)]
        self.assertEqual(m.plan(rows,set(),{"0":{"at":99,"image":"0"},"1":{"at":100,"image":"other"}}),["2","1"])
    def test_thresholds(self):
        self.assertEqual([m.level(x) for x in (74,75,85,90)],[0,75,85,90])
        self.assertEqual(m.level(72,90),75)
        self.assertEqual(m.level(69,90),0)
    def test_missing_and_stale(self):
        disks={"app":{"used_percent":75}}
        self.assertEqual(m.metric_sample({"timestamp":100,"vps":{"cpu":"50%","ram_percent":40,"https":"OK"}},disks,400),(400,None,None,75,None))
        self.assertEqual(m.metric_sample({"timestamp":390,"vps":{"cpu":"50%","ram_percent":40,"https":"OK"}},disks,400),(400,50,40,75,1))
    def test_no_destructive_global_prune(self):
        src=pathlib.Path(m.__file__).read_text()
        self.assertIn('command("docker", "builder", "prune", "--force", "--filter", "until=168h"',src)
        self.assertIn('command("docker", "image", "rm", tag)',src)
        self.assertNotIn('"system", "prune"',src)
        self.assertNotIn('"volume", "prune"',src)
    def test_release_test_only_before_production(self):
        src=(pathlib.Path(m.__file__).parent/"deploy-community-vps.sh").read_text()
        self.assertIn('git check-ref-format "refs/heads/$BRANCH"',src)
        self.assertLess(src.index('ALL ISOLATED CHECKS PASSED'),src.index('=== PRODUCTION BACKUPS ==='))
    def test_period_monday(self):
        import datetime as dt
        x=dt.datetime(2026,11,30,9,tzinfo=m.MSK).timestamp()
        self.assertEqual(m.period(x),x)
        self.assertEqual(m.period(x-1),x-7*86400)

if __name__=="__main__":
    unittest.main()
