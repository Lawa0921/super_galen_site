import math
import unittest
from collections import Counter
from landmark_kit_geometry import arch_profile, extruded_profile, assert_footprint

class GeometryTests(unittest.TestCase):
    def test_curved_keystone_profile_is_closed_thick_and_volume_positive(self):
        profile=arch_profile(.8,1.15,0,math.pi/6,8)
        vertices,faces=extruded_profile(profile,.48)
        edges=Counter(tuple(sorted((face[i],face[(i+1)%len(face)]))) for face in faces for i in range(len(face)))
        self.assertEqual(set(edges.values()),{2})
        self.assertAlmostEqual(max(v[1] for v in vertices)-min(v[1] for v in vertices),.48)
        volume=0
        for f in faces:
            a=vertices[f[0]]
            for i in range(1,len(f)-1):
                b,c=vertices[f[i]],vertices[f[i+1]]
                volume+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6
        self.assertGreater(volume,0)
        # More than four points on each curve; no flat trapezoid substitute.
        self.assertGreater(len(profile),12)

    def test_concave_broken_wall_extrusion_retains_profile(self):
        p=[(-1,0),(1,0),(1,1.3),(.3,.9),(.2,1.6),(-1,1.8)]
        vertices,faces=extruded_profile(p,.3)
        self.assertEqual(len(vertices),len(p)*2)
        self.assertEqual(len(faces),len(p)+2)
        self.assertTrue(all((v[0],v[2]) in p for v in vertices))

    def test_rejects_thin_inverted_and_degenerate_geometry(self):
        for args in [(1,.8,0,1,8),(.8,1,0,0,8),(.8,1,0,1,0)]:
            with self.assertRaises(ValueError):arch_profile(*args)
        for p,d in [([(0,0),(1,0),(2,0)],.3), ([(0,0),(1,0),(1,1)],0)]:
            with self.assertRaises(ValueError):extruded_profile(p,d)

    def test_bounds_regression_accepts_ground_sink_rejects_overflow(self):
        assert_footprint([(-1.9,1.9,-.08),(1.9,-1.9,5.2)])
        for v in [(1.9001,0,1),(0,0,-.0801),(0,0,5.2001)]:
            with self.assertRaises(ValueError):assert_footprint([v])

if __name__=='__main__':unittest.main()
