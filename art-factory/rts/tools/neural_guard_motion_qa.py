"""Evaluate real skinned pose bounds, foot-ground gap and sword path; render contact frames."""

import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from neural_blender_qa import render_view
from neural_guard_production_spec import CLIP_FRAMES
from neural_guard_production import set_shield_tint


def evaluated_positions(obj):
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    matrix = evaluated.matrix_world
    points = [matrix @ vertex.co for vertex in mesh.vertices]
    evaluated.to_mesh_clear()
    return points


def main():
    run = Path(sys.argv[sys.argv.index("--") + 1]).resolve()
    bpy.ops.wm.open_mainfile(filepath=str(run / "candidate" / "guard-production-v1.blend"))
    scene = bpy.context.scene
    arm = bpy.data.objects["GuardRig20"]
    set_shield_tint(bpy.data.materials["TeamCloth_Shield"], (0.045, 0.10, 0.33))
    body = bpy.data.objects["GuardBody_LOD0"]
    sword = bpy.data.objects["KingdomSteelSword_LOD0"]
    for name in ("GuardBody_LOD0", "KingdomSteelSword_LOD0", "KingdomSunShield_LOD0"):
        bpy.data.objects[name].hide_render = False
    for name in ("GuardBody_LOD1", "KingdomSteelSword_LOD1", "KingdomSunShield_LOD1"):
        bpy.data.objects[name].hide_render = True
    blade_tip_index = min(range(len(sword.data.vertices)), key=lambda index: sword.data.vertices[index].co.z)
    center = Vector((0, 0, 0.93))
    distance = 6.51
    source_tip = None
    results = {}
    for name in ("Idle", "Walk", "Attack", "Hurt", "Death"):
        arm.animation_data.action = bpy.data.actions[name]
        samples = []
        for frame, _ in CLIP_FRAMES[name]:
            scene.frame_set(frame)
            body_points = evaluated_positions(body)
            sword_points = evaluated_positions(sword)
            min_z = min(point.z for point in body_points)
            max_z = max(point.z for point in body_points)
            tip = sword_points[blade_tip_index]
            if name == "Attack" and source_tip is None:
                source_tip = tip.copy()
            samples.append({"frame": frame, "body_min_z": round(min_z, 4), "body_max_z": round(max_z, 4), "sword_tip_world": [round(value, 4) for value in tip]})
            if name in ("Walk", "Attack", "Death") and frame in (0, 6, 10, 13, 20, 22, 30, 36):
                render_view(f"{name}-contact-{frame}", center + Vector((distance, distance, distance * 0.75)), center, 3.1, 512, 512, run / "qa" / f"{name.lower()}-contact-{frame:02d}.png")
        results[name] = samples
    attack_tip = [Vector(sample["sword_tip_world"]) for sample in results["Attack"]]
    displacement = max((point - attack_tip[0]).length for point in attack_tip[1:])
    result = {
        "source": "evaluated Blender armature skin at keyed poses; z=0 normalized ground",
        "body_height_rest_m": round(results["Idle"][0]["body_max_z"] - results["Idle"][0]["body_min_z"], 4),
        "attack_tip_max_displacement_m": round(displacement, 4),
        "poses": results,
        "contact_scope": "Foot-ground gaps are measured; no enemy collision or hit box was authored or claimed",
    }
    (run / "qa" / "motion-contact-qa.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8", newline="\n")
    print("GUARD_MOTION_QA=" + json.dumps(result))


if __name__ == "__main__":
    main()
