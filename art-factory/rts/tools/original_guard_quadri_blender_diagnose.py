"""Read-only Blender mesh diagnosis after QuadriFlow rejected the prepared source."""

import json
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from original_guard_quadri_blender import NPZ, QA, create_mesh


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    data = np.load(NPZ)
    obj = create_mesh("Probe", data["vertices"], data["triangles"])
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    zero = [face for face in bm.faces if face.calc_area() == 0]
    inconsistent = [edge for edge in bm.edges if edge.is_manifold and not edge.is_contiguous]
    bad_vertices = [vertex for vertex in bm.verts if not vertex.is_manifold]
    result = {
        "zero_area_bmesh_faces": [{
            "index": face.index,
            "vertex_indices": [v.index for v in face.verts],
            "coordinates": [list(v.co) for v in face.verts],
            "edge_lengths": [edge.calc_length() for edge in face.edges],
            "edge_neighbor_faces": [[{"index": other.index,
                                      "vertex_indices": [vertex.index for vertex in other.verts],
                                      "area": other.calc_area(),
                                      "normal_dot": face.normal.dot(other.normal)}
                                     for other in edge.link_faces if other != face]
                                    for edge in face.edges],
            "area": face.calc_area(), "normal": list(face.normal),
        } for face in zero[:10]],
        "zero_area_bmesh_count": len(zero),
        "inconsistent_bmesh_edge_count": len(inconsistent),
        "nonmanifold_bmesh_vertex_count": len(bad_vertices),
        "nonmanifold_bmesh_vertex_samples": [vertex.index for vertex in bad_vertices[:20]],
        "boundary_bmesh_edge_count": sum(edge.is_boundary for edge in bm.edges),
        "nonmanifold_bmesh_edge_count": sum(not edge.is_manifold and not edge.is_boundary for edge in bm.edges),
        "signed_volume": bm.calc_volume(signed=True),
    }
    bm.free()
    QA.joinpath("blender-cancel-diagnosis.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2), flush=True)


if __name__ == "__main__":
    main()
