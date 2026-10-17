import unittest
import numpy as np
from roof_winding import oriented_roof_faces


class RoofTests(unittest.TestCase):
    def test_both_slopes_face_sky_with_corner_uv_correspondence(self):
        verts=[(-2,-1,0),(0,-1,1),(0,1,1),(-2,1,0),(2,-1,0),(0,-1,1),(0,1,1),(2,1,0)]
        source=[(0,1,2,3),(4,5,6,7)]
        faces,loops=oriented_roof_faces(verts,source,False)
        for face in faces:
            a,b,c=np.array(verts)[list(face[:3])];self.assertGreater(np.cross(b-a,c-a)[2],0)
        for i,face in enumerate(faces):
            self.assertEqual(list(face),[source[i][corner] for corner in loops[i]])
        self.assertEqual(faces[0],source[0]);self.assertNotEqual(faces[1],source[1])

    def test_shingle_drip_follows_its_flipped_surface_and_invalid_pair_rejected(self):
        verts=[(2,-1,0),(0,-1,1),(0,1,1),(2,1,0),(2,-1,.02),(0,-1,1.02),(0,1,1.02),(2,1,.02)]
        # Deliberately downward face and paired drip, as on the old opposite slope.
        faces=[(4,5,6,7),(0,1,5,4)]
        fixed,_=oriented_roof_faces(verts,faces,True)
        self.assertEqual(fixed,[tuple(reversed(f)) for f in faces])
        with self.assertRaises(ValueError):oriented_roof_faces(verts,faces[:1],True)


if __name__=='__main__':unittest.main()
