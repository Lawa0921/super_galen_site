"""Regress actual visible upper-skirt triangles, not an invented UV threshold."""
import bpy,hashlib,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from original_crossbow_drape_bake import SOURCE,skirt_faces

class DrapeSelectionTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()=='91d1048ab31dad70e4e66b2a99cea3d666de6e8fb201f9a084f16c00b5922ffe'
        bpy.ops.wm.open_mainfile(filepath=str(SOURCE))

    def test_visible_upper_skirt_is_included(self):
        body=bpy.data.objects['crossbowOriginalBody_LOD0']
        selected={p.index for p in skirt_faces(body)}
        # Camera rays through black flecks in the 1000px unlit front image.
        self.assertTrue({12640,13858,13838}.issubset(selected))

    def test_arms_and_lower_legs_remain_outside(self):
        for lod in (0,1):
            body=bpy.data.objects[f'crossbowOriginalBody_LOD{lod}']
            for face in skirt_faces(body):
                for i in face.vertices:
                    v=body.data.vertices[i]
                    self.assertLess(abs(v.co.x),.325)
                    self.assertGreater(v.co.z,.665)
                    self.assertLess(v.co.z,1.17)

if __name__=='__main__':
    result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(DrapeSelectionTest))
    if not result.wasSuccessful():raise AssertionError('Drape selection regression failed')
