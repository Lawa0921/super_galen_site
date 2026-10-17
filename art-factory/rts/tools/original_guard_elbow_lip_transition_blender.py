"""Transition-pose images at the newly measured lip/couter crossings."""
import json
import sys
from pathlib import Path

import bpy
import numpy as np

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))
import original_guard_arm_hinge_visibility_blender as baseline_view
from original_guard_arm_hinge import load_source
from original_guard_arm_hinge_visibility import all_pose_meshes
from original_guard_elbow_lip import RUN


def main():
    out = RUN / "qa"
    bpy.ops.wm.open_mainfile(filepath=str(RUN / "candidate/original-guard-elbow-lip.blend"))
    baseline_view.OUT = out
    geometry = json.loads((RUN / "candidate/original-guard-elbow-lip-geometry.json").read_text())
    components = geometry["components"]
    sweep = json.loads((baseline_view.RUN / "qa/sweep-report.json").read_text())
    config = sweep["configurations"][0]
    parts, stations, centers = load_source()
    parts["ForearmArmor"]["vertices"] = np.asarray(components["ForearmArmor"]["vertices"], float)
    parts["FlexibleSleeve"] = {"vertices": np.asarray(components["FlexibleSleeve"]["vertices"], float)}
    names = baseline_view.PARTS
    objects = {pose: {part: bpy.data.objects[f"{pose}_{part}"] for part in names}
               for pose in baseline_view.POSES}
    for bend in (60, 75):
        pose = f"bend{bend}"
        posed = all_pose_meshes(parts, stations, centers, config, bend, 0)
        objects[pose] = {}
        collection = bpy.data.collections.new("Pose_" + pose + "_diagnostic_only")
        bpy.context.scene.collection.children.link(collection)
        for part in names:
            mesh = bpy.data.meshes.new(pose + "_" + part)
            mesh.from_pydata(posed[part].tolist(), [], components[part]["faces"])
            mesh.update()
            obj = bpy.data.objects.new(pose + "_" + part, mesh)
            collection.objects.link(obj)
            mesh.materials.append(bpy.data.materials["QA " + part])
            for polygon in mesh.polygons:
                polygon.use_smooth = True
            objects[pose][part] = obj
        baseline_view.render(objects, pose, "side-close-new-crossing", (.413, .011, 1.21),
                             (1.6, 0, .2), .11)
        baseline_view.render(objects, pose, "action-close-new-crossing", (.413, .011, 1.21),
                             (1.1, 1.2, .45), .11)
        baseline_view.render(objects, pose, "side-close-new-crossing", (.413, .011, 1.21),
                             (1.6, 0, .2), .11, wire=True)
    print("ELBOW_LIP_TRANSITION_RENDER_DONE", flush=True)


if __name__ == "__main__":
    main()
