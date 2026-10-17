"""Local original-surface forearm cap retreat for the best +X elbow hinge.

Only four proximal cap fan faces change. Every pre-cap exterior vertex and face,
including the source arm's visible rim, remains byte-for-byte representable by
its original numeric coordinates and face cycle.
"""
import copy
import json
from collections import defaultdict
from pathlib import Path

import numpy as np

from original_guard_arm_hinge import SOURCE_RUN, unit, write_json
from original_guard_solid_arm import AXIS

ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / "art-factory/rts/runs/original-guard-elbow-rim/2026-10-05"
ROI_FACES = (222, 223, 224, 225)
ROI_RIM_VERTICES = (208, 211, 213)
CAP_CENTER = 183
RETREAT_M = .005
RADIAL_M = .005


def topology_report(component):
    vertices = np.asarray(component["vertices"], float)
    incidences = defaultdict(list)
    areas = []
    for face in component["faces"]:
        for a, b in zip(face, face[1:] + face[:1]):
            incidences[tuple(sorted((a, b)))].append((a, b))
        for index in range(1, len(face) - 1):
            a, b, c = vertices[np.asarray((face[0], face[index], face[index + 1]))]
            areas.append(float(np.linalg.norm(np.cross(b - a, c - a)) / 2))
    return {"boundary_edges": sum(len(owners) != 2 for owners in incidences.values()),
            "inconsistent_winding_edges": sum(len(owners) == 2 and owners[0] == owners[1]
                                              for owners in incidences.values()),
            "zero_area_triangles": sum(area <= 1e-12 for area in areas),
            "minimum_triangle_area_m2": min(areas),
            "vertex_count": len(vertices), "polygon_count": len(component["faces"])}


def patch_forearm_cap(source, retreat_m=RETREAT_M, radial_m=RADIAL_M):
    if not (0 < retreat_m <= .012 and 0 < radial_m <= .015):
        raise ValueError("Local retreat must stay within the bounded 12/15 mm design envelope")
    faces = source["faces"]
    expected = {222: [183, 206, 208], 223: [183, 208, 211],
                224: [183, 211, 213], 225: [183, 213, 214]}
    if {face: faces[face] for face in ROI_FACES} != expected:
        raise ValueError("Frozen source cap fan topology changed")
    patched = copy.deepcopy(source)
    vertices = np.asarray(source["vertices"], float)
    new_vertices = vertices.tolist()
    new_ids = {}
    for rim_id in ROI_RIM_VERTICES:
        rim = vertices[rim_id]
        radial = unit(vertices[CAP_CENTER] - rim)
        if abs(radial @ AXIS) > 1e-7:
            raise ValueError("Original cap is not planar at the local rim")
        new_ids[rim_id] = len(new_vertices)
        new_vertices.append((rim + radial_m * radial + retreat_m * AXIS).tolist())
    i208, i211, i213 = (new_ids[vertex] for vertex in ROI_RIM_VERTICES)
    replacements = {
        222: [[183, 206, i208], [206, 208, i208]],
        223: [[183, i208, i211], [i208, 208, 211], [i208, 211, i211]],
        224: [[183, i211, i213], [i211, 211, 213], [i211, 213, i213]],
        225: [[183, i213, 214], [i213, 213, 214]],
    }
    new_faces = []
    source_face_mapping = []
    for index, face in enumerate(faces):
        generated = replacements.get(index, [face])
        new_faces.extend(generated)
        source_face_mapping.extend([index] * len(generated))
    patched["vertices"] = new_vertices
    patched["faces"] = new_faces
    topology = topology_report(patched)
    if any(topology[key] for key in ("boundary_edges", "inconsistent_winding_edges", "zero_area_triangles")):
        raise ValueError(f"Local patch did not close as a wound solid: {topology}")
    triangles = np.asarray([[face[0], face[k], face[k + 1]]
                            for face in new_faces for k in range(1, len(face) - 1)], int)
    tri_vertices = np.asarray(new_vertices)[triangles]
    volume = abs(float(np.einsum("ij,ij->", tri_vertices[:, 0],
                                      np.cross(tri_vertices[:, 1], tri_vertices[:, 2])) / 6))
    patched["qa"] = {**patched["qa"], "watertight": True,
                     "winding_consistent": True, "faces": len(new_faces),
                     "volume_m3": volume,
                     "local_patch_topology": topology}
    audit = {"replaced_source_face_indices": list(ROI_FACES),
             "new_vertex_ids_from_source_rim": new_ids,
             "unchanged_source_face_count": len(faces) - len(ROI_FACES),
             "source_face_mapping": source_face_mapping,
             "inner_vertex_retreat_m": [float((np.asarray(new_vertices[new_ids[i]]) - vertices[i]) @ AXIS)
                                        for i in ROI_RIM_VERTICES],
             "inner_vertex_radial_offset_m": radial_m,
             "topology": topology}
    return patched, audit


def main():
    geometry = json.loads((SOURCE_RUN / "candidate/original-guard-solid-arm-geometry.json").read_text(encoding="utf-8"))
    source = geometry["components"]["ForearmArmor"]
    patched, audit = patch_forearm_cap(source)
    geometry["components"]["ForearmArmor"] = patched
    geometry["status"] = "qa_failed"
    geometry["runtime_publish_allowed"] = False
    geometry["local_revision"] = {"source_model": str(SOURCE_RUN.relative_to(ROOT)),
                                  "roi": "ForearmArmor proximal cap fan faces 222-225 only",
                                  "retreat_m": RETREAT_M, "radial_m": RADIAL_M}
    write_json(RUN / "candidate/original-guard-elbow-rim-geometry.json", geometry)
    write_json(RUN / "qa/source-face-audit.json", audit)
    print("ELBOW_RIM_LOCAL_PATCH", topology_report(patched), flush=True)


if __name__ == "__main__":
    main()
