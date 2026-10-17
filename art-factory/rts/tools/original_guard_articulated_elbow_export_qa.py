"""Independent artifact and rigid-motion checks for the rejected local package."""
import hashlib
import json
import struct

import numpy as np
import trimesh

from original_guard_articulated_elbow import RUN, pose_components
from original_guard_solid_arm import SOURCE, SOURCE_SHA, triangulate, write_json


def main():
    candidate_path = RUN / "candidate/original-guard-articulated-elbow-geometry.json"
    candidate = json.loads(candidate_path.read_text())
    components = candidate["components"]
    structure = {}
    edges = {}
    for name, part in components.items():
        faces = triangulate(part["faces"])
        mesh = trimesh.Trimesh(vertices=part["vertices"], faces=faces, process=False)
        structure[name] = {"closed": bool(mesh.is_watertight),
                           "winding_consistent": bool(mesh.is_winding_consistent),
                           "positive_volume": bool(mesh.volume > 0),
                           "triangles": len(faces)}
        if name != "FlexibleSleeve":
            edges[name] = np.unique(np.sort(np.vstack((faces[:, [0,1]], faces[:, [1,2]],
                                                       faces[:, [2,0]])), axis=1), axis=0)
    worst = {name: 0. for name in edges}
    for bend in range(0, 91, 5):
        for roll in range(0, 46, 5):
            posed = pose_components(candidate, bend, roll)
            for name, part_edges in edges.items():
                original = np.asarray(components[name]["vertices"])
                before = np.linalg.norm(original[part_edges[:, 0]]-original[part_edges[:, 1]], axis=1)
                after = np.linalg.norm(posed[name][part_edges[:, 0]]-posed[name][part_edges[:, 1]], axis=1)
                worst[name] = max(worst[name], float(np.max(abs(before-after))))
    glb_path = RUN / "candidate/original-guard-articulated-elbow-localanimated.glb"
    blend_path = RUN / "candidate/original-guard-articulated-elbow.blend"
    data = glb_path.read_bytes()
    json_size, chunk_type = struct.unpack_from("<II", data, 12)
    if data[:4] != b"glTF" or chunk_type != 0x4e4f534a:
        raise ValueError("Invalid animated GLB")
    gltf = json.loads(data[20:20+json_size])
    node_names = {node.get("name") for node in gltf.get("nodes", [])}
    report = {"status": "artifact_valid_but_visual_qa_failed",
              "runtime_publish_allowed": False,
              "source_sha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
              "source_hash_matches": hashlib.sha256(SOURCE.read_bytes()).hexdigest() == SOURCE_SHA,
              "solid_topology": structure,
              "rigid_edge_error_max_m": worst,
              "rigid_edge_below_1e_6": all(value < 1e-6 for value in worst.values()),
              "glb_skin_count": len(gltf.get("skins", [])),
              "glb_animation_count": len(gltf.get("animations", [])),
              "glb_named_bones_present": all(name in node_names for name in
                                              ("UpperArm", "ElbowSupport", "Forearm")),
              "glb_sha256": hashlib.sha256(data).hexdigest(),
              "blend_sha256": hashlib.sha256(blend_path.read_bytes()).hexdigest()}
    write_json(RUN / "qa/artifact-audit.json", report)
    print("ARTICULATED_ELBOW_ARTIFACT_AUDIT", report["rigid_edge_error_max_m"],
          report["glb_skin_count"], report["glb_animation_count"], flush=True)


if __name__ == "__main__":
    main()
