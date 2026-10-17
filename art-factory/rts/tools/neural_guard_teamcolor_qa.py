"""Render an alternate team tint to prove armor and equipment remain independent."""

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
    cloth = bpy.data.materials["TeamCloth"]
    shield = bpy.data.materials["TeamCloth_Shield"]
    tint_node = next(node for node in cloth.node_tree.nodes if node.type == "MIX" and node.blend_type == "MULTIPLY")
    tint_socket = next(socket for socket in tint_node.inputs if socket.identifier == "A_Color")
    original_cloth = list(tint_socket.default_value)
    original_shield = list(shield.node_tree.nodes.get("Principled BSDF").inputs["Base Color"].default_value)
    for name in ("GuardBody_LOD0", "KingdomSteelSword_LOD0", "KingdomSunShield_LOD0"):
        bpy.data.objects[name].hide_render = False
    for name in ("GuardBody_LOD1", "KingdomSteelSword_LOD1", "KingdomSunShield_LOD1"):
        bpy.data.objects[name].hide_render = True
    arm = bpy.data.objects["GuardRig20"]
    arm.animation_data.action = bpy.data.actions["Idle"]
    bpy.context.scene.frame_set(0)
    center = Vector((0, 0, 0.93))
    colors = {"blue": (0.24, 0.45, 0.95), "red": (0.92, 0.16, 0.13)}
    renders = {}
    for name, color in colors.items():
        tint_socket.default_value = (*color, 1.0)
        set_shield_tint(shield, color)
        renders[name] = render_view(f"team-{name}", center + Vector((0, 6.51, 0)), center, 1.86 * 1.18, 640, 800, run / "qa" / f"teamcloth-{name}-check.png")
    report = {"body_material": cloth.name, "shield_material": shield.name, "exported_shield_factor": original_shield, "original_body_factor": original_cloth, "review_factors": {name: list(color) for name, color in colors.items()}, "armor_material": "GuardArmor", "unchanged_ornament_materials": ["WarmBrass", "ForgedSteel"], "renders": renders}
    (run / "qa" / "teamcloth-recolor-qa.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8", newline="\n")
    print("GUARD_TEAMCOLOR_QA=" + json.dumps(report))


if __name__ == "__main__":
    main()
