import importlib.util,pathlib,tempfile,unittest
from unittest.mock import patch
path=pathlib.Path(__file__).resolve().parents[1]/"scripts/bricklab-control-actions.py"
spec=importlib.util.spec_from_file_location("actions",path)
a=importlib.util.module_from_spec(spec)
spec.loader.exec_module(a)
class Maintenance(unittest.TestCase):
    def test_disabled_until_proxy_configured(self):
        with tempfile.TemporaryDirectory() as d:
            marker=pathlib.Path(d)/"enabled"
            config=pathlib.Path(d)/"configured"
            with patch.object(a,"MAINTENANCE",marker),patch.object(a,"MAINTENANCE_CONFIG",config):
                self.assertEqual(a.execute("maintenance_on"),"approval_required")
                self.assertFalse(marker.exists())
                config.touch()
                self.assertEqual(a.execute("maintenance_on"),"ok")
                self.assertTrue(marker.exists())
                self.assertEqual(a.execute("maintenance_off"),"ok")
                self.assertFalse(marker.exists())
                self.assertEqual(a.execute("maintenance_off"),"ok")
if __name__=="__main__":
    unittest.main()
