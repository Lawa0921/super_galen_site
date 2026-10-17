"""Meaningful ring selection, correspondence, topology and skin-contract checks."""
import unittest
from collections import Counter

import numpy as np
from source_fit_cage import select_local_loop, radial_resample, contour_resample, align_ring, capped_ring_mesh, skin_weights


def ellipse(center, rx, ry, n=128):
    a = np.linspace(0, 2*np.pi, n, endpoint=False)
    pts = np.array(center) + np.column_stack((rx*np.cos(a), ry*np.sin(a), a*0))
    return np.vstack((pts, pts[0]))


class SourceFitCageTest(unittest.TestCase):
    def test_ring_phase_alignment_prevents_twisted_strips_after_extremum_jump(self):
        a=ellipse([0,0,0],.04,.08,32)[:-1]
        b=np.roll(a+[.005,.002,.02],7,axis=0)
        np.testing.assert_allclose(align_ring(a,b),a+[.005,.002,.02],atol=1e-12)

    def test_contour_sampling_keeps_reentrant_groove_and_consistent_correspondence(self):
        p=np.array([[-1,-1,0],[1,-1,0],[1,-.2,0],[.2,-.2,0],[.2,.2,0],[1,.2,0],[1,1,0],[-1,1,0],[-1,-1,0]])
        a=contour_resample(p,[0,0,0],[0,0,1],64)
        q=np.roll(p[:-1][::-1],3,axis=0); q=np.vstack((q,q[0]))
        b=contour_resample(q,[0,0,0],[0,0,1],64)
        np.testing.assert_allclose(a,b,atol=1e-10)
        self.assertTrue(np.any((abs(a[:,0]-.2)<1e-8)&(abs(a[:,1])<.19)))
        self.assertEqual(len(a),64)

    def test_selects_arm_and_rejects_merged_torso_even_when_hint_is_inside(self):
        arm = ellipse([.31, -.04, 1.2], .075, .08)
        torso = ellipse([.06, 0, 1.2], .3, .18)
        result = select_local_loop([torso, arm], [.33, 0, 1.2], [0,0,1], .22, .11)
        np.testing.assert_array_equal(result, arm)
        with self.assertRaisesRegex(ValueError, 'local closed'):
            select_local_loop([torso], [.1,0,1.2], [0,0,1], .22, .11)

    def test_open_contour_is_not_silently_closed(self):
        with self.assertRaisesRegex(ValueError, 'local closed'):
            select_local_loop([ellipse([0,0,0], .05,.06)[:-3]], [0,0,0], [0,0,1], .2,.1)

    def test_radial_correspondence_does_not_depend_on_source_start_or_winding(self):
        loop = ellipse([.2,-.1,0], .06,.09)
        reverse = np.vstack((np.roll(loop[:-1][::-1], 13,axis=0), np.roll(loop[:-1][::-1],13,axis=0)[0]))
        a = radial_resample(loop, [.2,-.1,0], [0,0,1], 32)
        b = radial_resample(reverse, [.2,-.1,0], [0,0,1], 32)
        np.testing.assert_allclose(a,b,atol=1e-10)
        self.assertAlmostEqual(np.ptp(a[:,0]), .12)
        self.assertAlmostEqual(np.ptp(a[:,1]), .18)

    def test_radial_sampling_rejects_center_outside_surface(self):
        with self.assertRaisesRegex(ValueError, 'star-shaped'):
            radial_resample(ellipse([0,0,0],.06,.09), [.5,0,0], [0,0,1], 24)

    def test_quad_strip_with_caps_is_closed_oriented_and_non_degenerate(self):
        rings = [ellipse([0,0,z], .05,.08, 16)[:-1] for z in (0,.1,.2)]
        verts, faces = capped_ring_mesh(rings)
        counts = Counter()
        directed = Counter()
        for face in faces:
            self.assertEqual(len(set(face)),len(face))
            for a,b in zip(face,face[1:]+face[:1]):
                counts[tuple(sorted((a,b)))] += 1
                directed[(a,b)] += 1
        self.assertTrue(all(c==2 for c in counts.values()))
        self.assertTrue(all(directed[(b,a)]==c for (a,b),c in directed.items()))
        self.assertEqual(sum(len(f)==4 for f in faces),32)
        self.assertEqual(len(verts)-len(counts)+len(faces),2)

    def test_incompatible_ring_counts_fail_before_build(self):
        with self.assertRaises(ValueError):
            capped_ring_mesh([ellipse([0,0,0],.05,.08,16)[:-1],ellipse([0,0,.1],.05,.08,12)[:-1]])

    def test_coincident_rings_are_rejected_as_zero_area_geometry(self):
        ring=ellipse([0,0,0],.05,.08,16)[:-1]
        with self.assertRaisesRegex(ValueError,'Degenerate'):
            capped_ring_mesh([ring,ring.copy()])

    def test_skinning_is_partition_of_unity_and_rigid_outside_joint_band(self):
        weights = skin_weights(np.array([0,.08,.1,.12,.2]), .1, .04)
        np.testing.assert_allclose(weights.sum(axis=1),1)
        np.testing.assert_allclose(weights[0],[1,0])
        np.testing.assert_allclose(weights[-1],[0,1])
        np.testing.assert_allclose(weights[2],[.5,.5])
        self.assertTrue(np.all(np.diff(weights[:,1])>=0))


if __name__ == '__main__':
    unittest.main()
