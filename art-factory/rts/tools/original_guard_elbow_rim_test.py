"""Local forearm cap retreat must preserve the original exterior shell."""
import json
import unittest

import numpy as np

from original_guard_arm_hinge import SOURCE_RUN
from original_guard_elbow_rim import patch_forearm_cap, topology_report


class ElbowRimTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = json.loads((SOURCE_RUN / "candidate/original-guard-solid-arm-geometry.json").read_text())
        cls.forearm = cls.source["components"]["ForearmArmor"]

    def test_patch_preserves_exterior_and_non_roi_source_faces(self):
        patched, audit = patch_forearm_cap(self.forearm, retreat_m=.005, radial_m=.005)
        self.assertTrue(np.array_equal(np.asarray(patched["vertices"][:len(self.forearm["vertices"])]),
                                       np.asarray(self.forearm["vertices"])))
        self.assertEqual(patched["faces"][:self.forearm["pre_cap_exterior_polygon_count"]],
                         self.forearm["faces"][:self.forearm["pre_cap_exterior_polygon_count"]])
        self.assertEqual(audit["replaced_source_face_indices"], [222, 223, 224, 225])
        self.assertEqual(audit["unchanged_source_face_count"], len(self.forearm["faces"]) - 4)
        for candidate_face, source_face_index in zip(patched["faces"], audit["source_face_mapping"]):
            if source_face_index not in (222, 223, 224, 225):
                self.assertEqual(candidate_face, self.forearm["faces"][source_face_index])
        self.assertGreaterEqual(min(audit["inner_vertex_retreat_m"]), .005 - 1e-9)
        self.assertGreater(patched["qa"]["volume_m3"], 0)
        self.assertEqual(topology_report(patched)["boundary_edges"], 0)
        self.assertEqual(topology_report(patched)["inconsistent_winding_edges"], 0)
        self.assertEqual(topology_report(patched)["zero_area_triangles"], 0)

    def test_invalid_retreat_or_radial_width_fails_closed(self):
        for retreat, radial in ((0, .005), (-.001, .005), (.005, 0), (.005, .2)):
            with self.subTest(retreat=retreat, radial=radial):
                with self.assertRaises(ValueError):
                    patch_forearm_cap(self.forearm, retreat_m=retreat, radial_m=radial)


if __name__ == "__main__":
    unittest.main()
