import importlib.util,pathlib,tempfile,unittest,json
from unittest.mock import patch,MagicMock
path=pathlib.Path(__file__).resolve().parents[1]/"scripts/bricklab-control.py"
spec=importlib.util.spec_from_file_location("control",path)
c=importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)
UID="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
class Issue(unittest.TestCase):
    def test_private_data_not_exported_and_no_replay(self):
        with tempfile.TemporaryDirectory() as d,patch.dict(c.os.environ,{"STATE_DIRECTORY":d}),patch.object(c,"issue_token",return_value="token"),patch.object(c.urllib.request,"build_opener") as opener:
            r=MagicMock()
            r.status=201
            r.read.return_value=b'{"number":7}'
            opener.return_value.open.return_value.__enter__.return_value=r
            self.assertIn("#7",c.create_issue(UID))
            self.assertIn("#7",c.create_issue(UID))
            self.assertEqual(opener.return_value.open.call_count,1)
            payload=json.loads(opener.return_value.open.call_args.args[0].data)
            self.assertNotIn(UID,str(payload))
    def test_ambiguous_post_no_retry(self):
        with tempfile.TemporaryDirectory() as d,patch.dict(c.os.environ,{"STATE_DIRECTORY":d}),patch.object(c,"issue_token",return_value="token"),patch.object(c.urllib.request,"build_opener") as opener:
            opener.return_value.open.side_effect=OSError()
            c.create_issue(UID);c.create_issue(UID)
            self.assertEqual(opener.return_value.open.call_count,1)
if __name__=="__main__":
    unittest.main()
