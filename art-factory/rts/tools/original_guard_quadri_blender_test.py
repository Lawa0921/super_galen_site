"""Blender regression for the one permitted cap-sliver topology correction."""

import sys
from pathlib import Path

import bpy
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from original_guard_quadri_blender import (NPZ, create_mesh,
                                          dissolve_numeric_zero_cap, topology)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    data = np.load(NPZ)
    obj = create_mesh("CapCorrectionTest", data["vertices"], data["triangles"])
    before_points = {tuple(vertex.co) for vertex in obj.data.vertices}
    before = topology(obj)
    assert before["zero_area_faces"] == 1, before
    correction = dissolve_numeric_zero_cap(obj)
    after = topology(obj)
    assert correction["dissolved_zero_area_faces"] == 1, correction
    assert before_points == {tuple(vertex.co) for vertex in obj.data.vertices}
    assert after["faces"] == before["faces"] - 1, (before, after)
    assert after["zero_area_faces"] == 0, after
    assert after["boundary_edges"] == after["nonmanifold_edges"] == 0, after
    print("CAP_CORRECTION_TEST_PASS", correction, flush=True)


if __name__ == "__main__":
    main()
