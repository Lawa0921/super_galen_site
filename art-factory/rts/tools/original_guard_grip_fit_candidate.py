"""Save the audited original glove and original sword as a review-only fit pair."""
from pathlib import Path
import hashlib
import json
import math
import sys

import bpy
import numpy as np
from mathutils import Matrix

sys.path.insert(0, str(Path(__file__).resolve().parent))
from original_guard_grip_fit_math import rigid_fit
from original_guard_grip_fit_blender import (
    GLOVE, SWORD, RUN, EXPECTED_GLOVE, EXPECTED_SWORD,
    SOURCE_ORIGIN, SOURCE_AXIS, TARGET,
)


def mesh_fingerprint(mesh):
    vertices = np.asarray([tuple(vertex.co) for vertex in mesh.vertices], dtype=np.float32)
    loops = np.asarray([loop.vertex_index for loop in mesh.loops], dtype=np.int32)
    layout = np.asarray([(polygon.loop_start, polygon.loop_total) for polygon in mesh.polygons], dtype=np.int32)
    return hashlib.sha256(vertices.tobytes() + loops.tobytes() + layout.tobytes()).hexdigest()


def append_object(path, name):
    with bpy.data.libraries.load(str(path), link=False) as (source, destination):
        if name not in source.objects:
            raise ValueError(f"Missing original object {name}")
        destination.objects = [name]
    obj = destination.objects[0]
    bpy.context.collection.objects.link(obj)
    return obj


def main():
    diagnosis_path = RUN / "qa/diagnose-s0.900-spin90.json"
    diagnosis = json.loads(diagnosis_path.read_text(encoding="utf-8"))
    if not diagnosis["verdict"]["pass"]:
        raise ValueError("Full-mesh and four-contact fit audit failed")
    for path, expected in [(GLOVE, EXPECTED_GLOVE), (SWORD, EXPECTED_SWORD)]:
        if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise ValueError(f"Source hash changed: {path}")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sword = append_object(SWORD, "KingdomSteelSword_LOD0")
    glove = append_object(GLOVE, "OriginalGripChannelCandidate")
    # Source sword is skinned to a guard rig in its original character scene.
    # The rest-pose mesh alone is the fixed geometry reference for this fit.
    for modifier in list(sword.modifiers):
        sword.modifiers.remove(modifier)
    sword.hide_viewport = False
    sword.hide_render = False
    sword.hide_set(False)
    source_fingerprints = {"glove": mesh_fingerprint(glove.data), "sword": mesh_fingerprint(sword.data)}
    scale = .9
    spin = 90.
    rotation, translation = rigid_fit(SOURCE_ORIGIN, SOURCE_AXIS, TARGET, scale, math.radians(spin))
    world = np.eye(4)
    world[:3, :3] = rotation * scale
    world[:3, 3] = translation
    glove.matrix_world = Matrix(world.tolist())
    glove.name = "OriginalGripRigidFitReviewOnly"
    glove["source_sha256"] = EXPECTED_GLOVE
    glove["local_mesh_sha256"] = source_fingerprints["glove"]
    sword["source_sha256"] = EXPECTED_SWORD
    sword["local_mesh_sha256"] = source_fingerprints["sword"]
    clay = bpy.data.materials.new("Grip inspection clay - review only")
    clay.diffuse_color = (.42, .52, .64, 1.)
    clay.use_nodes = True
    shader = clay.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (.42, .52, .64, 1.)
    shader.inputs["Roughness"].default_value = .58
    if glove.data.materials:
        glove.data.materials[0] = clay
    else:
        glove.data.materials.append(clay)
    candidate = RUN / "candidate"
    candidate.mkdir(parents=True, exist_ok=True)
    blend = candidate / "original-guard-grip-fit.blend"
    glb = candidate / "original-guard-grip-fit.glb"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    # Reopen to refresh the dependency graph after appending objects from two
    # libraries; exporting immediately after append omitted the sword in 5.2.1.
    bpy.ops.wm.open_mainfile(filepath=str(blend))
    sword = bpy.data.objects["KingdomSteelSword_LOD0"]
    glove = bpy.data.objects["OriginalGripRigidFitReviewOnly"]
    bpy.ops.export_scene.gltf(filepath=str(glb), export_format="GLB", use_selection=False, export_animations=False)
    report = {"status": "candidate_review_only", "runtime_publish_allowed": False,
              "source_sha256": diagnosis["source_sha256"], "source_local_mesh_fingerprints": source_fingerprints,
              "candidate_local_mesh_fingerprints": {"glove": mesh_fingerprint(glove.data), "sword": mesh_fingerprint(sword.data)},
              "scale": scale, "spin_degrees": spin, "rotation": rotation.tolist(), "translation": translation.tolist(),
              "mesh_modifications": "none: source glove and sword vertices and polygon loops preserved; rigid object transform only",
              "sha256": {"blend": hashlib.sha256(blend.read_bytes()).hexdigest(), "glb": hashlib.sha256(glb.read_bytes()).hexdigest()},
              "qa_reference": str(diagnosis_path.relative_to(RUN)).replace("\\", "/")}
    (RUN / "qa/candidate.json").write_bytes((json.dumps(report, indent=2) + "\n").encode("utf-8"))
    print("FIT_CANDIDATE " + json.dumps(report), flush=True)


if __name__ == "__main__":
    main()
