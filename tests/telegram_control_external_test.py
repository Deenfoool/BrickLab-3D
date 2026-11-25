import importlib.util,pathlib,unittest
path=pathlib.Path(__file__).resolve().parents[1]/"scripts/bricklab-control-external.py"
spec=importlib.util.spec_from_file_location("external",path)
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
class External(unittest.TestCase):
    def test_debounce_and_recovery(self):
        state,n=m.step({},False);self.assertFalse(n)
        state,n=m.step(state,False);self.assertTrue(n)
        state["announced"]=False
        state,n=m.step(state,False);self.assertFalse(n)
        state,n=m.step(state,True);self.assertFalse(n)
        state,n=m.step(state,True);self.assertTrue(n)
if __name__=="__main__":
    unittest.main()
