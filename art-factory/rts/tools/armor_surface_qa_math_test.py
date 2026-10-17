"""Containment proof must reject disconnected closed-shell inputs."""
import unittest
import numpy as np
from armor_surface_qa_math import face_component_count, prevalidated_surface_winding


class ArmorSurfaceQaTest(unittest.TestCase):
    def test_connected_tetrahedron_has_one_component(self):
        self.assertEqual(face_component_count([[0, 2, 1], [0, 1, 3], [0, 3, 2], [1, 2, 3]]), 1)

    def test_disconnected_closed_shells_do_not_qualify_for_single_sample_proof(self):
        first = [[0, 2, 1], [0, 1, 3], [0, 3, 2], [1, 2, 3]]
        second = [[v+4 for v in face] for face in first]
        self.assertEqual(face_component_count(first+second), 2)

    def test_sharing_only_a_vertex_does_not_connect_faces(self):
        self.assertEqual(face_component_count([[0, 1, 2], [0, 3, 4]]), 2)
        self.assertEqual(face_component_count([[0, 1, 2], [2, 1, 3]]), 1)

    def test_winding_distinguishes_interior_from_outside_closed_tetrahedron(self):
        points = np.array([[0., 0., 0.], [1., 0., 0.], [0., 1., 0.], [0., 0., 1.]])
        faces = np.array([[0, 2, 1], [0, 1, 3], [0, 3, 2], [1, 2, 3]])
        self.assertAlmostEqual(prevalidated_surface_winding([.1, .1, .1], points[faces]), 1.)
        self.assertAlmostEqual(prevalidated_surface_winding([2., 2., 2.], points[faces]), 0.)
        self.assertAlmostEqual(prevalidated_surface_winding([.1, .1, .1], points[faces[:, ::-1]]), -1.)


if __name__ == '__main__':
    unittest.main()
