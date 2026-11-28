import runpy
import unittest
from pathlib import Path
import numpy as np
m=runpy.run_path(Path(__file__).resolve().parents[1]/"scripts/experiment-instruction-clean.py")
class CleanArtworkTest(unittest.TestCase):
    def test_stray_badge_is_removed(self):
        image=np.ones((80,100,3),dtype=np.float32)
        image[20:50,15:65]=(.8,.1,.1)
        baseline=m["cleaned_thumbnail"](image)
        image[6:14,81:89]=0
        actual=m["cleaned_thumbnail"](image)
        np.testing.assert_array_equal(baseline[0],actual[0])
        self.assertEqual(baseline[1],actual[1])
    def test_two_large_disconnected_objects_are_ambiguous(self):
        image=np.ones((80,100,3),dtype=np.float32)
        image[10:30,10:40]=0
        image[45:65,60:90]=0
        self.assertIsNone(m["cleaned_thumbnail"](image))
    def test_neutral_colors_remain_distinct(self):
        sample=np.ones((40,40,3),dtype=np.float32)
        sample[5:35,8:32]=.35
        other=sample.copy();other[5:35,8:32]=.65
        refs=[{"item":("a","71"),"sample":(sample,0.)},{"item":("a","72"),"sample":(other,0.)}]
        self.assertEqual(m["rank_clean"]((sample,0.),refs)[0][1],("a","71"))
if __name__=="__main__":
    unittest.main()
