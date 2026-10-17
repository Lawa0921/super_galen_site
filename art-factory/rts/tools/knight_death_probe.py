"""Read-only arm-pose clearance sweep on the current imported GLB."""

import bpy
import json
import math
import sys
from pathlib import Path
from mathutils import Quaternion, Vector


def z_bounds(ob):
    evaluated = ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
    data = evaluated.to_mesh()
    z = [(evaluated.matrix_world @ vertex.co).z for vertex in data.vertices]
    evaluated.to_mesh_clear()
    return [round(min(z), 3), round(max(z), 3)]


if __name__ == "__main__":
    glb = Path(sys.argv[sys.argv.index("--") + 1])
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    bpy.ops.import_scene.gltf(filepath=str(glb))
    rig = next(ob for ob in bpy.context.scene.objects if ob.type == "ARMATURE" and ob.name.startswith("MountedKnight"))
    lance = next(ob for ob in bpy.context.scene.objects if ob.type == "MESH" and ob.name.startswith("KnightLance"))
    shield = next(ob for ob in bpy.context.scene.objects if ob.type == "MESH" and ob.name.startswith("KnightSunShield"))
    for ob in bpy.context.scene.objects:
        if ob.animation_data:
            ob.animation_data.action = None
            for track in ob.animation_data.nla_tracks:
                track.mute = track.name != "Death"
    bpy.context.scene.frame_set(48)
    result = []
    for name, obj in (("UpperArm_R", lance), ("UpperArm_L", shield), ("Forearm_R", lance), ("Forearm_L", shield)):
        bone = rig.pose.bones[name]
        original = bone.rotation_quaternion.copy()
        for axis in "XYZ":
            world_axis = {"X": Vector((1, 0, 0)), "Y": Vector((0, 1, 0)), "Z": Vector((0, 0, 1))}[axis]
            local_axis = bone.bone.matrix_local.to_3x3().inverted() @ world_axis
            for angle in (-120, -90, -60, -30, 30, 60, 90, 120):
                bone.rotation_quaternion = Quaternion(local_axis, math.radians(angle)) @ original
                bpy.context.view_layer.update()
                result.append((name, axis, angle, z_bounds(obj)))
        bone.rotation_quaternion = original
    print(json.dumps(result), flush=True)
