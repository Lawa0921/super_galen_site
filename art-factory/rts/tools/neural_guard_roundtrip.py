"""Independently import each guard GLB in Blender and evaluate nonstatic clips."""

import json
import sys
from pathlib import Path

import bpy


def inspect(glb):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)
    bpy.ops.import_scene.gltf(filepath=str(glb))
    arms = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    # Blender's importer creates hidden Icosphere custom bone-shape helpers;
    # only skinned mesh objects are asset geometry.
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH" and any(mod.type == "ARMATURE" for mod in obj.modifiers)]
    if len(arms) != 1 or len(meshes) != 3:
        raise RuntimeError(f"Roundtrip objects: {len(arms)} armature, {[obj.name for obj in meshes]} meshes")
    arm = arms[0]
    clips = {}
    for name, bone, frames in (("Walk", "Thigh_L", (0, 10, 20)), ("Attack", "UpperArm_R", (0, 6, 13)), ("Hurt", "SpineUpper", (0, 6, 14)), ("Death", "Root", (0, 20, 36)), ("Idle", "SpineUpper", (0, 20, 40))):
        action = bpy.data.actions.get(name)
        if action is None:
            raise RuntimeError(f"Missing reimported action {name}")
        arm.animation_data.action = action
        rotations = []
        positions = []
        for frame in frames:
            bpy.context.scene.frame_set(frame)
            matrix = arm.pose.bones[bone].matrix.copy()
            rotations.append(matrix.to_quaternion())
            positions.append(list(matrix.translation))
        angles = [round(rotations[0].rotation_difference(rotation).angle, 4) for rotation in rotations[1:]]
        clips[name] = {"test_bone": bone, "sample_frames": list(frames), "rotation_delta_radians_from_first": angles, "sample_joint_positions": positions}
        if max(angles) < 0.01:
            raise RuntimeError(f"Clip does not move expected bone: {name}: {angles}")
    return {
        "file": str(glb), "armature": arm.name, "bones": len(arm.data.bones),
        "mesh_names": [obj.name for obj in meshes],
        "triangles": sum(len(face.vertices) - 2 for obj in meshes for face in obj.data.polygons),
        "actions": sorted(action.name for action in bpy.data.actions), "motion_samples": clips,
    }


def main():
    run = Path(sys.argv[sys.argv.index("--") + 1]).resolve()
    report = {}
    for lod in ("lod0", "lod1"):
        report[lod] = inspect(run / "candidate" / f"guard-production-{lod}.glb")
    (run / "qa" / "blender-roundtrip.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8", newline="\n")
    print("GUARD_BLENDER_ROUNDTRIP=" + json.dumps(report))


if __name__ == "__main__":
    main()
