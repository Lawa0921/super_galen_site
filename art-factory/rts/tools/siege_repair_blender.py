"""Repair the siege Death pivot in editable Blender sources and re-export.

The generated source keeps each mechanical part on its own animation pivot.
Only the chassis collapse is reduced; wheel, bow, banner and bolt motion stay
authored.  This preserves a readable break-up while keeping the rear axle on
the ground.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import bpy
from mathutils import Quaternion


SCALE = 0.45


def args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run", type=Path, default=Path(os.environ.get("PROPS_RUN", ".")))
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return parser.parse_args(argv)


def channelbag(action):
    if not action.is_action_layered:
        raise AssertionError(f"Expected layered action: {action.name}")
    strips = [strip for layer in action.layers for strip in layer.strips]
    if len(strips) != 1:
        raise AssertionError(f"Expected one keyframe strip in {action.name}")
    if len(strips[0].channelbags) != 1:
        raise AssertionError(f"Expected one channel bag in {action.name}")
    return strips[0].channelbags[0]


def repair_action(action) -> dict:
    bag = channelbag(action)
    curves = {
        (curve.data_path, curve.array_index): curve
        for curve in bag.fcurves
    }
    loc = [curves[("location", index)] for index in range(3)]
    rot = [curves[("rotation_euler", index)] for index in range(3)]
    frames = [point.co.x for point in loc[0].keyframe_points]
    if frames != [point.co.x for point in loc[1].keyframe_points] or frames != [point.co.x for point in loc[2].keyframe_points]:
        raise AssertionError("Chassis location channels do not share keyframes")
    if any([frames != [point.co.x for point in curve.keyframe_points] for curve in rot]):
        raise AssertionError("Chassis rotation channels do not share keyframes")

    before_final = {"location": [curve.evaluate(frames[-1]) for curve in loc],
                    "rotation_euler_xyz": [curve.evaluate(frames[-1]) for curve in rot]}
    for curve in loc:
        for point in curve.keyframe_points:
            point.co.y *= SCALE
        curve.update()
    for curve in rot:
        for point in curve.keyframe_points:
            point.co.y *= SCALE
        curve.update()
    after_final = {"location": [curve.evaluate(frames[-1]) for curve in loc],
                   "rotation_euler_xyz": [curve.evaluate(frames[-1]) for curve in rot]}
    return {"action": action.name, "scale": SCALE, "keyframes": len(frames), "before_final": before_final, "after_final": after_final}


def export_scene(path: Path) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for object_ in bpy.context.scene.objects:
        if object_.type in {"MESH", "EMPTY"}:
            object_.select_set(True)
    bpy.context.view_layer.objects.active = next(object_ for object_ in bpy.context.scene.objects if object_.name == "SiegeRoot")
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format="GLB", use_selection=True,
        export_yup=True, export_apply=True, export_normals=True,
        export_texcoords=True, export_materials="EXPORT", export_extras=True,
        export_animations=True, export_animation_mode="NLA_TRACKS",
        export_nla_strips=True, export_anim_slide_to_zero=True,
    )


def main() -> None:
    parsed = args()
    run = parsed.run.resolve()
    rows = []
    for lod in (0, 1):
        source = run / "raw" / f"siege-lod{lod}.blend"
        bpy.ops.wm.open_mainfile(filepath=str(source))
        armature = bpy.data.objects.get("SiegeRoot")
        if armature is None:
            raise AssertionError("SiegeRoot missing")
        armature["rtsDeathPivotRepair"] = "ChassisRecoilPivot collapse reduced to 45 percent for ground contact"
        action = bpy.data.actions.get("ChassisRecoilPivot_Death")
        if action is None:
            raise AssertionError("ChassisRecoilPivot_Death missing")
        change = repair_action(action)
        repaired_source = run / "raw" / "repaired" / f"siege-lod{lod}.blend"
        repaired_source.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.file.pack_all()
        bpy.ops.wm.save_as_mainfile(filepath=str(repaired_source), compress=True)
        repaired_glb = run / "repaired" / "candidate" / f"siege-lod{lod}.glb"
        export_scene(repaired_glb)
        rows.append({"lod": lod, "source": str(repaired_source), "candidate": str(repaired_glb), "change": change})
    report = run / "qa" / "siege-pivot-repair.json"
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_bytes((json.dumps(rows, indent=2) + "\n").encode("utf-8"))
    print(json.dumps(rows, indent=2))


if __name__ == "__main__":
    main()
