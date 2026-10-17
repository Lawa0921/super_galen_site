import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

import trimesh


SCRIPT = Path(__file__).with_name("hunyuan_guard_mesh_qa.py")


def load_module():
    spec = importlib.util.spec_from_file_location("hunyuan_guard_mesh_qa", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class MeshQaTests(unittest.TestCase):
    def setUp(self):
        self.module = load_module()

    @staticmethod
    def two_boots():
        left = trimesh.creation.box(extents=(0.32, 0.5, 0.6))
        left.apply_translation((-0.3, 0.25, 0.0))
        right = left.copy()
        right.apply_translation((0.6, 0.0, 0.0))
        return trimesh.util.concatenate((left, right))

    def test_two_capped_boots_pass_preservation_gate(self):
        result = self.module.assess_cleaned_body(self.two_boots())
        self.assertTrue(result["feet_preserved"])
        self.assertTrue(result["watertight"])
        self.assertEqual(result["cap_island_count"], 2)
        self.assertLess(result["cap_islands"][0]["center_xyz"][0], 0)
        self.assertGreater(result["cap_islands"][1]["center_xyz"][0], 0)

    def test_missing_boot_fails_preservation_gate(self):
        one_boot = trimesh.creation.box(extents=(0.32, 0.5, 0.6))
        one_boot.apply_translation((-0.3, 0.25, 0.0))
        result = self.module.assess_cleaned_body(one_boot)
        self.assertFalse(result["feet_preserved"])
        self.assertEqual(result["cap_island_count"], 1)


if __name__ == "__main__":
    unittest.main()
