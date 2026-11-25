import importlib.util,pathlib,unittest
from unittest.mock import patch
scripts=pathlib.Path(__file__).resolve().parents[1]/"scripts"
spec=importlib.util.spec_from_file_location("actions",scripts/"bricklab-control-actions.py")
a=importlib.util.module_from_spec(spec)
spec.loader.exec_module(a)
class Release(unittest.TestCase):
    def test_requires_independent_approval(self):
        with patch.object(a.os.path,"isfile",return_value=False),patch.object(a,"run") as run:
            self.assertEqual(a.execute("deploy"),"approval_required")
            run.assert_not_called()
    def test_queued_is_not_success(self):
        with patch.object(a.os.path,"isfile",return_value=True),patch.object(a,"run",return_value=(0,"")) as run:
            self.assertEqual(a.execute("deploy"),"queued")
            self.assertEqual(run.call_args.args[0],["/usr/bin/systemctl","start","--no-block","bricklab-control-release.service"])
if __name__=="__main__":
    unittest.main()
