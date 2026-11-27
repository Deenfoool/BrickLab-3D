import hashlib,hmac,importlib.util,json,pathlib,unittest,urllib.parse
from unittest.mock import patch
path=pathlib.Path(__file__).resolve().parents[1]/"scripts/bricklab-control-miniapp.py"
spec=importlib.util.spec_from_file_location("miniapp",path)
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
def signed(token,user=42,stamp=10000):
    f={"auth_date":str(stamp),"user":json.dumps({"id":user}),"query_id":"abc"}
    secret=hmac.new(b"WebAppData",token.encode(),hashlib.sha256).digest()
    f["hash"]=hmac.new(secret,"\n".join(k+"="+v for k,v in sorted(f.items())).encode(),hashlib.sha256).hexdigest()
    return urllib.parse.urlencode(f)
class Mini(unittest.TestCase):
    def test_signature_owner_expiry(self):
        token="123:abc"
        raw=signed(token)
        self.assertTrue(m.validate(raw,token,42,10001))
        for bad,owner,now in [(raw,43,10001),(raw,42,10400),(raw+"&user=x",42,10001),(raw.replace("abc","def"),42,10001),(signed(token,stamp=10100),42,10000)]:
            self.assertFalse(m.validate(bad,token,owner,now))
    def test_snapshot_privacy(self):
        with patch.object(m.SNAPSHOT.__class__,"read_text",return_value=json.dumps({"timestamp":10000,"stats":{"users":4},"admin":{"users":["private"]},"audit":{"recent":["private"]}})),patch.object(m.time,"time",return_value=10001):
            self.assertEqual(m.data(),{"timestamp":10000,"stats":{"users":4}})
    def test_job_post_requires_owner_and_origin(self):
        handler=object.__new__(m.Handler)
        handler.path="/control/jobs"
        handler.headers={"Origin":"https://evil.invalid"}
        handler.authorized=lambda:True
        with patch.object(handler,"reply") as reply,patch.object(m,"job_request") as job:
            handler.do_POST()
            self.assertEqual(reply.call_args.args[0],403)
            job.assert_not_called()
        handler.headers={"Origin":m.ORIGIN}
        handler.authorized=lambda:False
        with patch.object(handler,"reply") as reply,patch.object(m,"job_request") as job:
            handler.do_POST()
            self.assertEqual(reply.call_args.args[0],403)
            job.assert_not_called()
    def test_job_post_rejects_non_job_actions(self):
        import io
        handler=object.__new__(m.Handler)
        handler.path="/control/jobs"
        handler.authorized=lambda:True
        body=b'{"action":"shell"}'
        handler.headers={"Origin":m.ORIGIN,"Content-Length":str(len(body)),"Content-Type":"application/json"}
        handler.rfile=io.BytesIO(body)
        with patch.object(handler,"reply") as reply,patch.object(m,"job_request") as job:
            handler.do_POST()
            self.assertEqual(reply.call_args.args[0],400)
            job.assert_not_called()
if __name__=="__main__":
    unittest.main()
