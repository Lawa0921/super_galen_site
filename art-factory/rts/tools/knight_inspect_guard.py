"""Record original guard v3 Blender source properties for mounted adaptation."""

import bpy
import hashlib
import json
from pathlib import Path
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
RUN = ROOT / "runs" / "kingdom-knight" / "2026-10-05-v1"
SOURCE = RUN / "raw" / "inputs" / "guard-production-v1.blend"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


if __name__ == "__main__":
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    rows = []
    for ob in bpy.context.scene.objects:
        row = {"name": ob.name, "type": ob.type, "location": list(ob.location), "scale": list(ob.scale)}
        if ob.type == "MESH":
            points = [ob.matrix_world @ Vector(point) for point in ob.bound_box]
            row.update({
                "vertices": len(ob.data.vertices),
                "triangles": sum(len(face.vertices) - 2 for face in ob.data.polygons),
                "materials": [mat.name for mat in ob.data.materials if mat],
                "uv_layers": [uv.name for uv in ob.data.uv_layers],
                "bounds_min": [min(v[i] for v in points) for i in range(3)],
                "bounds_max": [max(v[i] for v in points) for i in range(3)],
            })
        rows.append(row)
    result = {"source": str(SOURCE.relative_to(ROOT)), "sha256": sha(SOURCE), "objects": rows, "images": [{"name": im.name, "size": list(im.size), "packed": bool(im.packed_file)} for im in bpy.data.images if im.size[0]], "materials": [{"name": mat.name, "images": [{"name": node.image.name if node.image else None, "filepath": node.image.filepath if node.image else None} for node in mat.node_tree.nodes if node.type == "TEX_IMAGE"] if mat.use_nodes else []} for mat in bpy.data.materials], "runtime_publish_allowed": False}
    result["actions"] = [{"name": action.name, "frames": list(action.frame_range)} for action in bpy.data.actions]
    dest = RUN / "qa" / "guard-production-inspect.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(json.dumps(result, indent=2).encode("utf-8"))
    print(json.dumps(result, indent=2))
