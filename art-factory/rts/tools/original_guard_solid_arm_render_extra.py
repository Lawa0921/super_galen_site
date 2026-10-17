"""Complete flat and action-wire inspection views without resaving geometry."""
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).parent))
from original_guard_solid_arm import RUN
from original_guard_solid_arm_blender import render


def main():
    bpy.ops.wm.open_mainfile(filepath=str(RUN / "candidate/original-guard-solid-arm.blend"))
    scene = bpy.context.scene
    scene.render.resolution_x = 720
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    renders = RUN / "qa/renders"
    for name, frame in (("neutral", 0), ("combined", 90)):
        scene.frame_set(frame)
        for view, offset in (("front", (0, 1.6, .25)),
                             ("side", (1.6, 0, .2)),
                             ("back", (0, -1.6, .25))):
            render(renders / f"{name}-{view}-flat.png", (.34, -.04, 1.17), offset, .58, "flat")
    for name, frame in (("bend90", 30), ("roll45", 60), ("combined", 90)):
        scene.frame_set(frame)
        render(renders / f"{name}-action-close-wire.png", (.35, -.03, 1.18),
               (1.1, 1.2, .45), .42, "wire")
    print("SOLID_ARM_EXTRA_RENDERS_COMPLETE", flush=True)


if __name__ == "__main__":
    main()
