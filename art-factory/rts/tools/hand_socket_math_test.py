import unittest
from hand_socket_math import validate_socket_cap


class SocketCapTests(unittest.TestCase):
    def setUp(self):
        self.cap = [[4, 5, 6], [4, 6, 7]]
        self.retained = [[3, 2, 1, 0], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]
        self.loop = [4, 5, 6, 7]
        self.weights = {i: {'Forearm_R': 1.0} for i in self.loop}

    def validate(self, **overrides):
        args = dict(cap_faces=self.cap, retained_faces=self.retained, loop=self.loop,
                    weights=self.weights, materials={'TeamCloth.001'},
                    expected_vertices=4, expected_triangles=2)
        args.update(overrides)
        return validate_socket_cap(**args)

    def test_connected_disk_and_opposite_retained_edge_directions(self):
        result = self.validate()
        self.assertEqual(result['boundary_edges'], 4)
        self.assertEqual(result['euler_characteristic'], 1)
        self.assertEqual(result['collar_start_edge_direction'], 'same as ordered loop, opposite retained sleeve')

    def test_internal_cap_edge_winding_must_be_consistent(self):
        with self.assertRaisesRegex(ValueError, 'winding'):
            self.validate(cap_faces=[[4, 5, 6], [7, 6, 4]])

    def test_cap_cannot_have_a_disconnected_extra_patch(self):
        with self.assertRaises(ValueError):
            self.validate(cap_faces=self.cap + [[8, 9, 10]], expected_triangles=3, expected_vertices=7)

    def test_same_boundary_positions_do_not_replace_shared_vertex_identity(self):
        with self.assertRaisesRegex(ValueError, 'boundary'):
            self.validate(cap_faces=[[14, 15, 16], [14, 16, 17]])

    def test_loop_direction_is_prescribed(self):
        with self.assertRaisesRegex(ValueError, 'direction'):
            self.validate(loop=list(reversed(self.loop)))

    def test_other_open_sleeve_boundaries_are_rejected(self):
        with self.assertRaisesRegex(ValueError, 'boundary'):
            self.validate(retained_faces=self.retained[1:])

    def test_unexpected_material_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'material'):
            self.validate(materials={'Steel'})

    def test_joint_weight_drift_is_rejected(self):
        self.weights[4] = {'Forearm_R': .999, 'Hand_R': .001}
        with self.assertRaisesRegex(ValueError, 'weight'):
            self.validate()


if __name__ == '__main__':
    unittest.main()
