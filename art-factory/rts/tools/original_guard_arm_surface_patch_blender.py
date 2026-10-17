"""Rebuild the isolated outer-patch sample and check in-between rig frames."""
import hashlib
import json
from pathlib import Path
import sys

import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).parent))
import original_guard_arm_articulate_blender as previous

ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / "art-factory/rts/runs/original-guard-arm-surface-patch/2026-10-05"


def main():
    previous.RUN = RUN
    previous.main()
    scene = bpy.context.scene
    report_path = RUN / "qa/pose-report.json"
    report = json.loads(report_path.read_text(encoding="utf8"))
    data = json.loads((RUN / "candidate/original-guard-arm-articulation.json").read_text(encoding="utf8"))
    names = list(data["components"])
    objects = {name: bpy.data.objects[name] for name in names}
    report["intermediate_frames"] = {}
    for frame in (15, 45, 75, 105):
        scene.frame_set(frame)
        meshes = {name: previous.evaluated_mesh(obj) for name, obj in objects.items()}
        record = {"self_collision_pairs": {name: previous.self_collision_pairs(*mesh)
                                            for name, mesh in meshes.items()},
                  "cross_collision_pairs": {}, "armor_max_edge_error_m": {}}
        for name in names:
            if name != "FlexibleElbowSleeve":
                record["armor_max_edge_error_m"][name] = previous.edge_error(
                    np.asarray(data["components"][name]["vertices"]), *meshes[name])
        for i, left in enumerate(names):
            for right in names[i + 1:]:
                record["cross_collision_pairs"][f"{left}/{right}"] = previous.collision_pairs(
                    *meshes[left], *meshes[right])
        report["intermediate_frames"][str(frame)] = record
    scene.frame_set(0)
    renders = RUN / "qa/renders"
    for name, offset in (("front", (0, 2, .35)), ("side", (-2, 0, .35)), ("back", (0, -2, .35))):
        cam = previous.camera((.345, 0, 1.17), offset, .47)
        scene.render.filepath = str(renders / f"neutral-{name}.png")
        bpy.ops.render.render(write_still=True)
        bpy.data.objects.remove(cam, do_unlink=True)
    report["renders_sha256"] = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in renders.glob("*.png")}
    report["tools_sha256"][Path(__file__).name] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    patch_tool = Path(__file__).with_name("original_guard_arm_surface_patch.py")
    report["tools_sha256"][patch_tool.name] = hashlib.sha256(patch_tool.read_bytes()).hexdigest()
    report["status"] = "qa_failed" if any(
        any(value for value in record["self_collision_pairs"].values()) or
        any(value for value in record["cross_collision_pairs"].values())
        for record in list(report["poses"].values()) + list(report["intermediate_frames"].values())) else "mechanical_pass_pending_review"
    report_path.write_bytes((json.dumps(report, indent=2) + "\n").encode("utf8"))
    print(json.dumps({"status": report["status"], "intermediate": report["intermediate_frames"]}))


if __name__ == "__main__":
    main()
