import runpy
import unittest
from pathlib import Path
import numpy as np
m=runpy.run_path(Path(__file__).resolve().parents[1]/"scripts/experiment-instruction-recovery.py")
class RecoveryExperiment(unittest.TestCase):
    def sample(self,color):
        image=np.ones((40,40,3),dtype=np.float32)
        image[8:32,5:35]=color
        image[16:24,16:24]=1
        return image,0.
    def test_quantity_pair_and_ambiguous_pair(self):
        ids=[(10,30,40,38,"1234567")]
        q=(10,18,22,25,"2x")
        self.assertEqual(m["pair_inventory_labels"](ids,[q]),{0:q})
        self.assertEqual(m["pair_inventory_labels"](ids,[q,(10,18.1,22,25.1,"3x")]),{})
    def test_same_geometry_different_color(self):
        red=self.sample((.8,.1,.1))
        blue=self.sample((.1,.1,.8))
        refs=[{"sample":red,"item":("a","4"),"xref":1},{"sample":blue,"item":("a","1"),"xref":2}]
        self.assertEqual(m["recover"](red,refs,1)[0],("a","4"))
        refs.append({"sample":red,"item":("b","4"),"xref":1})
        self.assertIsNone(m["recover"](red,refs,1)[0])
    def test_no_single_candidate(self):
        red=self.sample((.8,.1,.1))
        self.assertIsNone(m["recover"](red,[{"sample":red,"item":("a","4"),"xref":1}],1)[0])
if __name__=="__main__":
    unittest.main()
