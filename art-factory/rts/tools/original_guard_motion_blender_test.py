"""Fast Blender integration test for the baked foot-lock implementation."""

import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from original_guard_motion_build import ARMATURE_NAME, FPS, create_actions
from original_guard_motion_spec import JOG_SPEED_MPS, guarded_jog_foot


def main():
    source = Path(sys.argv[sys.argv.index("--") + 1]).resolve()
    bpy.ops.wm.open_mainfile(filepath=str(source))
    armature = bpy.data.objects[ARMATURE_NAME]
    actions = create_actions(armature)
    armature.animation_data.action = actions["Walk"]
    for side in ("L", "R"):
        points = []
        heights = []
        for frame in range(20):
            time_s = frame / FPS
            if not guarded_jog_foot(time_s, side).stance:
                continue
            bpy.context.scene.frame_set(frame)
            toe = armature.matrix_world @ armature.pose.bones[f"Foot_{side}"].tail
            points.append(Vector((toe.x, toe.y + JOG_SPEED_MPS * time_s, toe.z)))
            heights.append(toe.z)
        max_slip = max((a - b).length for a in points for b in points)
        if max_slip > 0.06 or max(heights) > 0.02:
            raise AssertionError(f"{side} foot failed: slip={max_slip}, height={max(heights)}")
        print(f"BLENDER_FOOT_LOCK side={side} max_pairwise_slip_m={max_slip:.6f} max_height_m={max(heights):.6f}")


if __name__ == "__main__":
    main()
