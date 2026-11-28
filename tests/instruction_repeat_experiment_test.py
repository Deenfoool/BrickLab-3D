import runpy
import unittest
from pathlib import Path
import numpy as np
import pymupdf as fitz
m=runpy.run_path(Path(__file__).resolve().parents[1]/"scripts/experiment-instruction-repeat.py")
class RepeatRecoveryTest(unittest.TestCase):
    def sample(self,color):
        image=np.ones((40,40,3),dtype=np.float32)
        image[8:32,5:35]=color
        return image,0.
    def test_seed_requires_two_pages_and_inventory_agreement(self):
        red=self.sample((.8,.1,.1));blue=self.sample((.1,.1,.8))
        a=("a","4");b=("b","1")
        refs=[{"sample":red,"item":a},{"sample":blue,"item":b}]
        recover=m["repeat_candidate"]
        self.assertEqual(recover(red,"x",{"x":[(a,1,red),(a,2,red)]},refs),a)
        self.assertIsNone(recover(red,"x",{"x":[(a,1,red),(a,1,red)]},refs))
        self.assertIsNone(recover(red,"x",{"x":[(a,1,red),(b,2,red)]},refs))
        self.assertIsNone(recover(blue,"x",{"x":[(a,1,red),(a,2,red)]},refs))
    def test_recover_centered_artwork_in_frame_only(self):
        with fitz.open() as pdf:
            page=pdf.new_page(width=220,height=180)
            page.draw_rect(fitz.Rect(20,20,110,95),fill=(1,1,1))
            words=[(40,70,50,79,"2x")]
            images=[(1,(32,35,58,66)),(2,(120,20,160,65))]
            found=m["missing_artwork"](page,words,images,[])
            self.assertEqual(len(found),1)
            self.assertEqual(found[0][0],1)
            self.assertEqual(m["missing_artwork"](page,words,images,found),[])
if __name__=="__main__":
    unittest.main()
