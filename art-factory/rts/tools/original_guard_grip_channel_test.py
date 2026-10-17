"""Handle fitting regression tests, independent of Blender."""
import unittest
import numpy as np
from original_guard_grip_channel_math import fit_handle_axis, unchanged_coordinate_count, area_counts

class HandleFitTests(unittest.TestCase):
    def test_signed_zero_is_unchanged_but_nonzero_motion_is_detected(self):
        source=np.array([[-0.,.1,.2],[.3,.4,.5]],dtype=np.float32)
        result=np.array([[0.,.1,.2],[.30001,.4,.5]],dtype=np.float32)
        self.assertEqual(unchanged_coordinate_count(source,result),1)

    def test_positive_micro_triangle_is_not_a_zero_area_face(self):
        a=np.array([0.,0.,0.]);b=np.array([1e-8,0.,0.]);c=np.array([0.,1e-8,0.])
        area=float(np.linalg.norm(np.cross(b-a,c-a))/2)
        self.assertEqual(area_counts([0.,area,1.]),{"zero_area_faces":1,"micro_faces_below_1e_14_m2":2})

    def test_recovers_tilted_axis_and_encloses_all_stem_points(self):
        z=np.repeat([.015,.04,.29,.315],96)
        t=np.tile(np.linspace(0,2*np.pi,96,endpoint=False),4)
        points=np.column_stack((.071-.01*z+.026*np.cos(t),.02+.002*z+.026*np.sin(t),z))
        fit=fit_handle_axis(points)
        np.testing.assert_allclose(fit["origin"],[.071-.01*.17,.02+.002*.17,.17],atol=1e-9)
        np.testing.assert_allclose(fit["direction"],np.array([-.01,.002,1])/np.linalg.norm([-.01,.002,1]),atol=1e-9)
        self.assertGreaterEqual(fit["radius"],.0264)
        self.assertLess(fit["radius"],.0266)

    def test_rejects_non_cylindrical_or_missing_end_sections(self):
        with self.assertRaisesRegex(ValueError,"sections"):
            fit_handle_axis(np.zeros((20,3)))
        points=[]
        for z in [.015,.04,.29,.315]:
            for angle in np.linspace(0,2*np.pi,96,endpoint=False):
                points.append([.071+.026*np.cos(angle),.02+.05*np.sin(angle),z])
        with self.assertRaisesRegex(ValueError,"circular"):
            fit_handle_axis(np.array(points))

if __name__=="__main__": unittest.main()
