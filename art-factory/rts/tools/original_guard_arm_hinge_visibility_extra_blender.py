"""Close diagnostic views of the two cap-contact ray candidate clusters."""
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))

from original_guard_arm_hinge_visibility_blender import OUT, PARTS, POSES, render


def main():
    bpy.ops.wm.open_mainfile(filepath=str(OUT / "original-guard-best-hinge-visibility.blend"))
    objects = {pose: {part: bpy.data.objects[f"{pose}_{part}"] for part in PARTS}
               for pose in POSES}
    shots = (
        ("cap-upper-fore-side-close", (.291, .021, 1.308), (1.6, 0, .2)),
        ("cap-upper-fore-back-close", (.291, .021, 1.308), (0, -1.6, .25)),
        ("cap-elbow-fore-side-close", (.375, .036, 1.195), (1.6, 0, .2)),
    )
    for name, target, offset in shots:
        render(objects, "combined", name, target, offset, .11)
        render(objects, "combined", name, target, offset, .11, wire=True)
    print("HINGE_CAP_CLOSE_DONE", flush=True)


if __name__ == "__main__":
    main()
