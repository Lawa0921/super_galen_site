"""Read saved keyframes exactly as the GLB exporter sees them."""
import json
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT/"art-factory/rts/runs/original-guard-arm-production/2026-10-05"
POSES = (("idle", 0), ("bend75", 25), ("combined", 40))
NAMES = ("UpperArmArmor", "ElbowArmor", "ForearmArmor", "FlexibleSleeve")


def main():
    result = {}
    for name, frame in POSES:
        bpy.context.scene.frame_set(frame)
        bpy.context.view_layer.update()
        snapshot = {}
        for component in NAMES:
            obj = bpy.data.objects[component]
            evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
            mesh = evaluated.to_mesh()
            snapshot[component] = [list(evaluated.matrix_world @ vertex.co)
                                   for vertex in mesh.vertices]
            evaluated.to_mesh_clear()
        result[name] = snapshot
    target = RUN/"qa/keyed-blender-vertices.json"
    target.write_text(json.dumps({"poses": result}, separators=(",", ":")), encoding="utf-8")
    print("KEYED_BLENDER_QA", target, flush=True)


if __name__ == "__main__":
    main()
