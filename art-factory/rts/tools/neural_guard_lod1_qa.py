"""Render the actual lower-detail guard at RTS scale with matching lights."""

import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from neural_blender_qa import render_view
from neural_guard_production import set_shield_tint


def main():
    run = Path(sys.argv[sys.argv.index("--") + 1]).resolve()
    bpy.ops.wm.open_mainfile(filepath=str(run / "candidate" / "guard-production-v1.blend"))
    for name in ("GuardBody_LOD0", "KingdomSteelSword_LOD0", "KingdomSunShield_LOD0"):
        bpy.data.objects[name].hide_render = True
    for name in ("GuardBody_LOD1", "KingdomSteelSword_LOD1", "KingdomSunShield_LOD1"):
        bpy.data.objects[name].hide_render = False
    arm = bpy.data.objects["GuardRig20"]
    set_shield_tint(bpy.data.materials["TeamCloth_Shield"], (0.045, 0.10, 0.33))
    arm.animation_data.action = bpy.data.actions["Idle"]
    bpy.context.scene.frame_set(0)
    center = Vector((0, 0, 0.93))
    distance = 6.51
    front = render_view("lod1-front", center + Vector((0, distance, 0)), center, 1.86 * 1.18, 640, 800, run / "qa" / "lod1-front.png")
    game = render_view("lod1-game", center + Vector((distance, distance, distance * 0.75)), center, 1.86 * 1.18 * 1.15, 64, 64, run / "qa" / "lod1-game-64px.png")
    record = {"front": front, "game_64px": game, "lighting_and_cameras": "Same as neural_guard_production.py LOD0 stills; only visible LOD toggled"}
    (run / "qa" / "lod1-visual-qa.json").write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8", newline="\n")
    print("GUARD_LOD1_QA=" + json.dumps(record))


if __name__ == "__main__":
    main()
