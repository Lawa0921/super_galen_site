"""Source-derived local exterior lip must remain a closed original armor section."""
import json
import unittest

import numpy as np

from original_guard_elbow_lip import extend_forearm_lip
from original_guard_elbow_rim import RUN as RIM_RUN, topology_report


class ElbowLipTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = json.loads((RIM_RUN / "candidate/original-guard-elbow-rim-geometry.json").read_text())
        cls.forearm = cls.source["components"]["ForearmArmor"]

    def test_local_lip_is_wound_and_outside_source_faces_are_unchanged(self):
        patched, audit = extend_forearm_lip(self.forearm, extension_m=.008)
        self.assertEqual(patched["vertices"][:len(self.forearm["vertices"])], self.forearm["vertices"])
        self.assertEqual(audit["original_rim_edges"], [[208, 211], [211, 213]])
        self.assertEqual(audit["new_exterior_band_face_count"], 4)
        for new_face, source_index in zip(patched["faces"], audit["source_face_mapping"]):
            if source_index is not None and source_index not in (225, 226, 228, 229):
                self.assertEqual(new_face, self.forearm["faces"][source_index])
        qa = topology_report(patched)
        self.assertEqual(qa["boundary_edges"], 0)
        self.assertEqual(qa["inconsistent_winding_edges"], 0)
        self.assertEqual(qa["zero_area_triangles"], 0)
        self.assertEqual(patched["pre_cap_exterior_polygon_count"],
                         self.forearm["pre_cap_exterior_polygon_count"] + 4)
        self.assertTrue(np.allclose(audit["outer_lip_extension_m"], .008))

    def test_invalid_or_unbounded_extension_fails_closed(self):
        for extension in (0, -.001, .025):
            with self.subTest(extension=extension):
                with self.assertRaises(ValueError):
                    extend_forearm_lip(self.forearm, extension_m=extension)


if __name__ == "__main__":
    unittest.main()
