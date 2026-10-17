"""Read-only GLB structure and canonical-bounds check of frozen checkpoint."""

import hashlib
import json
import struct
from pathlib import Path

import trimesh


ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / "art-factory/rts/runs/original-guard-quadri-scaled/2026-10-05/revision-v2-checkpointed"
GLB = RUN / "candidate/original-guard-quadri-scaled-checkpoint.glb"


def main():
    data = GLB.read_bytes()
    magic, version, declared_length = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF" or version != 2 or declared_length != len(data):
        raise ValueError("Invalid GLB header")
    json_length, chunk_type = struct.unpack_from("<I4s", data, 12)
    if chunk_type != b"JSON":
        raise ValueError("GLB first chunk is not JSON")
    gltf = json.loads(data[20:20 + json_length])
    mesh = trimesh.load(GLB, force="mesh", process=False)
    bounds = mesh.bounds.tolist()
    if len(gltf.get("meshes", [])) != 1 or gltf.get("skins") or gltf.get("animations"):
        raise ValueError("Expected one unrigged, unanimated candidate mesh")
    # Blender's exporter maps its +Z up frame into glTF +Y up.
    if not (1.85 < bounds[1][1] - bounds[0][1] < 1.88):
        raise ValueError(f"GLB did not export at canonical 1.86m scale: {bounds}")
    result = {"status": "qa_failed_geometry", "runtime_publish_allowed": False,
              "glb_sha256": hashlib.sha256(data).hexdigest(),
              "mesh_count": len(gltf.get("meshes", [])),
              "skin_count": len(gltf.get("skins", [])),
              "animation_count": len(gltf.get("animations", [])),
              "material_count": len(gltf.get("materials", [])),
              "decoded_vertices": len(mesh.vertices),
              "decoded_triangles": len(mesh.faces),
              "bounds_gltf_y_up_m": bounds,
              "node_names": [node.get("name") for node in gltf.get("nodes", [])]}
    RUN.joinpath("qa/export-qa.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
