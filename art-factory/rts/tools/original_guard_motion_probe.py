"""Inspect the actual source armature before rebuilding its animation."""

import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def rounded(values):
    return [round(value, 6) for value in values]


def main():
    args = sys.argv[sys.argv.index("--") + 1:]
    blend_path = Path(args[0]).resolve()
    bpy.ops.wm.open_mainfile(filepath=str(blend_path))
    armature = bpy.data.objects["GuardRig20"]
    report = {
        "source": str(blend_path),
        "blender": bpy.app.version_string,
        "fps": bpy.context.scene.render.fps / bpy.context.scene.render.fps_base,
        "actions": {
            action.name: {
                "frame_range": rounded(action.frame_range),
                "duration_s": round((action.frame_range[1] - action.frame_range[0]) / (bpy.context.scene.render.fps / bpy.context.scene.render.fps_base), 6),
            }
            for action in bpy.data.actions
        },
        "bones": {},
    }
    for bone in armature.data.bones:
        direction = bone.tail_local - bone.head_local
        local_y_world = bone.matrix_local.to_3x3() @ Vector((0.0, 1.0, 0.0))
        report["bones"][bone.name] = {
            "parent": bone.parent.name if bone.parent else None,
            "head": rounded(bone.head_local),
            "tail": rounded(bone.tail_local),
            "direction": rounded(direction),
            "length": round(bone.length, 6),
            "local_y_matches_segment": round(direction.normalized().dot(local_y_world.normalized()), 6),
            "use_deform": bone.use_deform,
        }
    if bpy.data.actions.get("Walk"):
        armature.animation_data.action = bpy.data.actions["Walk"]
        report["walk_pose_points"] = []
        for frame in range(0, 21):
            bpy.context.scene.frame_set(frame)
            report["walk_pose_points"].append({
                "frame": frame,
                "root": rounded(armature.pose.bones["Root"].head),
                "left_head": rounded(armature.pose.bones["Foot_L"].head),
                "left_tail": rounded(armature.pose.bones["Foot_L"].tail),
                "right_head": rounded(armature.pose.bones["Foot_R"].head),
                "right_tail": rounded(armature.pose.bones["Foot_R"].tail),
            })
    payload = json.dumps(report, indent=2, sort_keys=True) + "\n"
    if len(args) > 1:
        output_path = Path(args[1]).resolve()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with output_path.open("w", encoding="utf-8", newline="\n") as output_file:
            output_file.write(payload)
    print("ORIGINAL_GUARD_RIG=" + json.dumps(report, sort_keys=True))


if __name__ == "__main__":
    main()
