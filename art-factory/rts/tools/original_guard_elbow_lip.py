"""Extend two original proximal forearm exterior edges into a local elbow lip.

The lip is a continuation of the original exterior faces 113-114 along the
source forearm's proximal axis. Its return side joins the already recessed
original cap; no separate armor primitive, whole-ring loft, or rig change.
"""
import copy
import json
from pathlib import Path

import numpy as np

from original_guard_arm_hinge import write_json
from original_guard_elbow_rim import RUN as RIM_RUN, topology_report
from original_guard_solid_arm import AXIS

ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / "art-factory/rts/runs/original-guard-elbow-lip/2026-10-05"
RIM_VERTICES = (208, 211, 213)
EXTENSION_M = .008


def extend_forearm_lip(source, extension_m=EXTENSION_M):
    if not (0 < extension_m <= .02):
        raise ValueError("Local original-rim extension must be within 20 mm")
    expected = {113: [211, 36, 25, 213], 114: [208, 48, 36, 211],
                225: [243, 208, 211], 226: [243, 211, 244],
                228: [244, 211, 213], 229: [244, 213, 245]}
    faces = source["faces"]
    if {index: faces[index] for index in expected} != expected:
        raise ValueError("Frozen exterior rim/cap join topology changed")
    vertices = np.asarray(source["vertices"], float)
    new_vertices = vertices.tolist()
    support, outer = {}, {}
    for vertex_id in RIM_VERTICES:
        support[vertex_id] = len(new_vertices)
        new_vertices.append((vertices[vertex_id] - AXIS * extension_m * .5).tolist())
    for vertex_id in RIM_VERTICES:
        outer[vertex_id] = len(new_vertices)
        new_vertices.append((vertices[vertex_id] - AXIS * extension_m).tolist())
    s208, s211, s213 = [support[i] for i in RIM_VERTICES]
    l208, l211, l213 = [outer[i] for i in RIM_VERTICES]
    exterior_bands = [
        [208, 211, s211, s208], [s208, s211, l211, l208],
        [211, 213, s213, s211], [s211, s213, l213, l211],
    ]
    cap_replacements = {
        225: [[243, l208, l211]],
        226: [[243, l211, 244]],
        228: [[244, l211, l213]],
        229: [[244, l213, 245]],
    }
    # Support vertices lie on the end edges. Split each return wall at the
    # support point instead of triangulating a collinear four-vertex fan.
    cap_end_walls = [[243, 208, s208], [243, s208, l208],
                     [213, 245, s213], [s213, 245, l213]]
    patched_faces = []
    source_face_mapping = []
    for index, face in enumerate(faces):
        generated = cap_replacements.get(index, [face])
        patched_faces.extend(generated)
        source_face_mapping.extend([index] * len(generated))
        if index == source["pre_cap_exterior_polygon_count"] - 1:
            patched_faces.extend(exterior_bands)
            source_face_mapping.extend([None] * len(exterior_bands))
    patched_faces.extend(cap_end_walls)
    source_face_mapping.extend([None] * len(cap_end_walls))
    patched = copy.deepcopy(source)
    patched["vertices"] = new_vertices
    patched["faces"] = patched_faces
    patched["pre_cap_exterior_polygon_count"] += len(exterior_bands)
    topology = topology_report(patched)
    if any(topology[key] for key in ("boundary_edges", "inconsistent_winding_edges", "zero_area_triangles")):
        raise ValueError(f"Original-rim lip is not a solid wound section: {topology}")
    triangles = np.asarray([[face[0], face[k], face[k + 1]]
                            for face in patched_faces for k in range(1, len(face) - 1)], int)
    tri_vertices = np.asarray(new_vertices)[triangles]
    volume = abs(float(np.einsum("ij,ij->", tri_vertices[:, 0],
                                      np.cross(tri_vertices[:, 1], tri_vertices[:, 2])) / 6))
    patched["qa"] = {**patched["qa"], "watertight": True,
                     "winding_consistent": True, "faces": len(patched_faces),
                     "volume_m3": volume, "local_lip_topology": topology}
    audit = {"source_revision": "original-guard-elbow-rim cap retreat",
             "original_rim_edges": [[208, 211], [211, 213]],
             "adjacent_original_exterior_faces": [114, 113],
             "original_exterior_face_cycles_changed": 0,
             "replaced_cap_join_source_faces": [225, 226, 228, 229],
             "new_exterior_band_face_count": len(exterior_bands),
             "new_return_wall_face_count": len(cap_end_walls),
             "support_vertex_ids": support, "outer_lip_vertex_ids": outer,
             "outer_lip_extension_m": [float((vertices[i] - np.asarray(new_vertices[outer[i]])) @ AXIS)
                                       for i in RIM_VERTICES],
             "source_face_mapping": source_face_mapping,
             "topology": topology}
    return patched, audit


def main():
    geometry = json.loads((RIM_RUN / "candidate/original-guard-elbow-rim-geometry.json").read_text())
    patched, audit = extend_forearm_lip(geometry["components"]["ForearmArmor"])
    geometry["components"]["ForearmArmor"] = patched
    geometry["status"] = "qa_failed"
    geometry["runtime_publish_allowed"] = False
    geometry["local_revision"] = {
        "source_model": str((RIM_RUN / "candidate/original-guard-elbow-rim-geometry.json").relative_to(ROOT)),
        "roi": "ForearmArmor rim edges 208-211 and 211-213; exterior continuation and four cap joins",
        "extension_m": EXTENSION_M, "support_row_fraction": .5,
    }
    write_json(RUN / "candidate/original-guard-elbow-lip-geometry.json", geometry)
    write_json(RUN / "qa/source-face-audit.json", audit)
    print("ELBOW_LIP_LOCAL_PATCH", audit["topology"], flush=True)


if __name__ == "__main__":
    main()
