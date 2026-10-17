"""Incident simplex contact regressions; also runs actual inspect in Blender."""
import sys
import unittest
from pathlib import Path

import numpy as np

sys.dont_write_bytecode = True


class IncidentContactTest(unittest.TestCase):
    def test_topology_cache_is_immutable_and_updates_with_faces(self):
        from armor_incident_contact_math import incident_pair_indices
        faces = np.array([[0, 1, 2], [0, 3, 4], [5, 6, 7]])
        before = faces.copy()
        first = incident_pair_indices(faces)
        np.testing.assert_array_equal(first, [[0, 1]])
        self.assertIs(incident_pair_indices(faces.copy()), first)
        with self.assertRaises(ValueError):
            first[0, 0] = 5
        np.testing.assert_array_equal(faces, before)
        faces[2, 0] = 0
        np.testing.assert_array_equal(incident_pair_indices(faces), [[0, 1], [0, 2], [1, 2]])

    def test_batch_matches_reference_for_seeded_pairs_without_mutating_inputs(self):
        from armor_incident_contact_math import incident_disallowed_pair_mask, incident_disallowed_contact
        rng = np.random.default_rng(20261009)
        points, faces, pairs = [], [], []
        for i in range(160):
            tri = rng.normal(size=(5, 3))
            tri[0] = 0.
            if i % 4 == 0:
                tri[:, 2] = 0.
            points.extend(tri)
            faces.extend(([5*i, 5*i+1, 5*i+2], [5*i, 5*i+1 if i % 2 else 5*i+3, 5*i+4]))
            pairs.append([2*i, 2*i+1])
        points, faces, pairs = np.array(points), np.array(faces), np.array(pairs)
        expected = [incident_disallowed_contact(points, faces[a], faces[b]) for a, b in pairs]
        before = (points.copy(), faces.copy(), pairs.copy())
        np.testing.assert_array_equal(incident_disallowed_pair_mask(points, faces, pairs), expected)
        np.testing.assert_array_equal(incident_disallowed_pair_mask(points, faces, pairs[::-1]), expected[::-1])
        for actual, original in zip((points, faces, pairs), before):
            np.testing.assert_array_equal(actual, original)
        self.assertEqual(incident_disallowed_pair_mask(points, faces, np.empty((0, 2), dtype=int)).shape, (0,))

    def test_batch_matches_reference_for_fixed_incident_contact_fixtures(self):
        import armor_incident_contact_math as contact_math
        self.assertTrue(callable(getattr(contact_math, 'incident_disallowed_pair_mask', None)),
                        'Batch contact API is missing')
        incident_disallowed_pair_mask = contact_math.incident_disallowed_pair_mask
        incident_disallowed_contact = contact_math.incident_disallowed_contact
        fixtures = [
            [[.5, .2, 0.], [.2, .5, 0.]],
            [[1., 1., 0.], [1., 1., 1.]],
            [[2., 2., 1.], [0., 0., -1.]],
            [[-1., 0., 1.], [0., -1., 1.]],
            [[-1., 0., 0.], [0., -1., 0.]],
            [[.5, .2, 2e-8], [.2, .5, 2e-8]],
            [[1., 1., 5e-8], [1., 1., 1.]],
            [[1., 1., 2e-7], [1., 1., 1.]],
        ]
        for extra in fixtures:
            points = np.array([[0., 0., 0.], [2., 0., 0.], [0., 2., 0.]] + extra)
            faces = np.array([[0, 1, 2], [0, 3, 4]])
            pairs = np.array([[0, 1], [1, 0]])
            expected = [incident_disallowed_contact(points, faces[a], faces[b]) for a, b in pairs]
            np.testing.assert_array_equal(incident_disallowed_pair_mask(points, faces, pairs), expected)
        for extra in ([[1., -1., 0.]], [[0., 0., 1.]], [[.5, .5, 0.]]):
            points = np.array([[0., 0., 0.], [2., 0., 0.], [0., 2., 0.]] + extra)
            faces = np.array([[0, 1, 2], [1, 0, 3]])
            self.assertEqual(incident_disallowed_pair_mask(points, faces, [[0, 1]]).tolist(),
                             [incident_disallowed_contact(points, *faces)])
        points = np.array([[0., 0., 0.], [2., 0., 0.], [0., 2., 0.]])
        faces = np.array([[0, 1, 2], [2, 1, 0]])
        self.assertEqual(incident_disallowed_pair_mask(points, faces, [[0, 1]]).tolist(), [True])

    def check_pair(self, extra, faces, expected):
        from armor_incident_contact_math import incident_disallowed_contact
        points = np.array([[0., 0., 0.], [2., 0., 0.], [0., 2., 0.]] + extra)
        self.assertEqual(incident_disallowed_contact(points, *faces), expected)
        self.assertEqual(incident_disallowed_contact(points, *faces[::-1]), expected)

    def test_shared_vertex_interior_face_is_rejected(self):
        self.check_pair([[.5, .2, 0.], [.2, .5, 0.]], [[0, 1, 2], [0, 3, 4]], True)

    def test_shared_edge_same_side_foldover_is_rejected(self):
        self.check_pair([[.5, .5, 0.]], [[0, 1, 2], [1, 0, 3]], True)

    def test_duplicate_face_is_rejected_even_with_reverse_winding(self):
        self.check_pair([], [[0, 1, 2], [2, 1, 0]], True)

    def test_legal_coplanar_manifold_edge_is_allowed(self):
        self.check_pair([[1., -1., 0.]], [[0, 1, 2], [1, 0, 3]], False)

    def test_legal_shared_point_touch_is_allowed(self):
        self.check_pair([[-1., 0., 0.], [0., -1., 0.]], [[0, 1, 2], [0, 3, 4]], False)

    def test_shared_point_extra_collinear_segment_is_rejected(self):
        self.check_pair([[1., 0., 0.], [0., -1., 0.]], [[0, 1, 2], [0, 3, 4]], True)

    def test_edge_intersection_detects_overlap_without_contained_nonshared_vertices(self):
        self.check_pair([[3., 1., 0.], [1., 3., 0.]], [[0, 1, 2], [0, 3, 4]], True)

    def test_rotation_translation_and_face_winding_preserve_classification(self):
        from armor_incident_contact_math import incident_disallowed_contact
        points = np.array([[0., 0., 0.], [2., 0., 0.], [0., 2., 0.], [.5, .2, 0.], [.2, .5, 0.]])
        axis = np.array([1., 2., 3.])/np.sqrt(14.)
        skew = np.array([[0, -axis[2], axis[1]], [axis[2], 0, -axis[0]], [-axis[1], axis[0], 0]])
        rotation = np.eye(3)+np.sin(.7)*skew+(1-np.cos(.7))*(skew @ skew)
        transformed = points @ rotation.T + [123., -456., 789.]
        self.assertTrue(incident_disallowed_contact(transformed, [2, 1, 0], [4, 3, 0]))

    def test_non_coplanar_normal_edge_is_allowed(self):
        self.check_pair([[0., 0., 1.]], [[0, 1, 2], [0, 1, 3]], False)

    def test_noncoplanar_edge_in_plane_beyond_shared_point_is_rejected(self):
        self.check_pair([[1., 1., 0.], [1., 1., 1.]], [[0, 1, 2], [0, 3, 4]], True)

    def test_noncoplanar_nonshared_edge_edge_contact_is_rejected(self):
        self.check_pair([[2., 2., 1.], [0., 0., -1.]], [[0, 1, 2], [0, 3, 4]], True)

    def test_noncoplanar_shared_point_only_is_allowed(self):
        self.check_pair([[-1., 0., 1.], [0., -1., 1.]], [[0, 1, 2], [0, 3, 4]], False)

    def test_noncoplanar_vertex_face_contact_inside_tolerance_is_rejected(self):
        self.check_pair([[1., 1., 5e-8], [1., 1., 1.]], [[0, 1, 2], [0, 3, 4]], True)

    def test_noncoplanar_vertex_face_outside_tolerance_is_allowed(self):
        self.check_pair([[1., 1., 2e-7], [1., 1., 1.]], [[0, 1, 2], [0, 3, 4]], False)

    def test_near_plane_inside_tolerance_is_conservatively_rejected(self):
        self.check_pair([[.5, .2, 2e-8], [.2, .5, 2e-8]], [[0, 1, 2], [0, 3, 4]], True)

    def test_noncoplanar_pair_with_only_shared_point_contact_is_allowed_outside_plane_tolerance(self):
        self.check_pair([[.5, .2, 1e-5], [.2, .5, 1e-5]], [[0, 1, 2], [0, 3, 4]], False)

    def test_degenerate_incident_face_is_fail_closed(self):
        self.check_pair([[1., 0., 0.]], [[0, 1, 2], [0, 1, 3]], True)

    def test_thin_but_resolved_legal_edge_is_allowed(self):
        self.check_pair([[1., -2e-7, 0.]], [[0, 1, 2], [0, 1, 3]], False)

    def test_nonincident_pairs_are_outside_helper_scope(self):
        self.check_pair([[0., 0., 0.], [2., 0., 0.], [0., 2., 0.]], [[0, 1, 2], [3, 4, 5]], False)

    def test_invalid_nonfinite_coordinates_are_rejected(self):
        from armor_incident_contact_math import incident_disallowed_contact
        with self.assertRaises(ValueError):
            incident_disallowed_contact(np.array([[0, 0, 0], [1, 0, 0], [0, np.nan, 0]]), [0, 1, 2], [0, 2, 1])


class BlenderInspectTest(unittest.TestCase):
    def test_actual_inspect_noncoplanar_extra_contacts_are_rejected(self):
        try:
            import bpy
        except ImportError:
            self.skipTest('Actual inspect integration requires Blender Python')
        from guard_armor_self_qa import inspect
        for extra in ([[1., 1., 0.], [1., 1., 1.]], [[2., 2., 1.], [0., 0., -1.]]):
            points = np.array([[0., 0., 0.], [2., 0., 0.], [0., 2., 0.]] + extra)
            result = inspect(points, np.array([[0, 1, 2], [0, 3, 4]]))
            print('NONCOPLANAR_INSPECT', result, flush=True)
            self.assertEqual(result.get('incident_disallowed_contacts', result.get('incident_disallowed_contacts', [])), [[0, 1]])

    def test_actual_inspect_reviewer_shared_vertex_fixture(self):
        try:
            import bpy
        except ImportError:
            self.skipTest('Actual inspect integration requires Blender Python')
        from guard_armor_self_qa import inspect
        points = np.array([[0., 0., 0.], [2., 0., 0.], [0., 2., 0.], [.5, .2, 0.], [.2, .5, 0.]])
        result = inspect(points, np.array([[0, 1, 2], [0, 3, 4]]))
        print('REVIEWER_INSPECT', result, flush=True)
        self.assertEqual(result.get('incident_disallowed_contacts', []), [[0, 1]])

    def test_actual_inspect_legal_edge_and_point_are_not_reported(self):
        try:
            import bpy
        except ImportError:
            self.skipTest('Actual inspect integration requires Blender Python')
        from guard_armor_self_qa import inspect
        points = np.array([[0., 0., 0.], [2., 0., 0.], [0., 2., 0.], [1., -1., 0.], [-1., 0., 0.], [0., -1., 0.], [0., 0., 1.], [-1., 0., 1.], [0., -1., 1.]])
        for faces in ([[0, 1, 2], [1, 0, 3]], [[0, 1, 2], [0, 4, 5]], [[0, 1, 2], [0, 1, 6]], [[0, 1, 2], [0, 7, 8]]):
            self.assertFalse(any(inspect(points, np.array(faces)).values()))


if __name__ == '__main__':
    unittest.main()
