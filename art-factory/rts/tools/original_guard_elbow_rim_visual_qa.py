"""Matched-camera pixel evidence for the bounded local cap retreat."""
import json

import numpy as np
from PIL import Image

from original_guard_arm_hinge import write_json
from original_guard_elbow_rim import RUN


def main():
    renders = RUN / "qa/renders"
    before = np.asarray(Image.open(renders / "before-combined-cap-elbow-fore-side-close-smooth.png"))[:, :, :3]
    after = np.asarray(Image.open(renders / "combined-cap-elbow-fore-side-close-smooth.png"))[:, :, :3]
    if before.shape != after.shape or before.shape[:2] != (900, 900):
        raise ValueError("Matched camera image dimensions changed")
    region = (slice(300, 560), slice(390, 500))
    before_region = before[region].mean(axis=2)
    after_region = after[region].mean(axis=2)
    result = {
        "status": "qa_failed_visual_notch_persists",
        "runtime_publish_allowed": False,
        "matched_camera": "original_guard_arm_hinge_visibility_extra_blender: target=(.375,.036,1.195), offset=(1.6,0,.2), ortho_scale=.11, 900px",
        "before_image": "renders/before-combined-cap-elbow-fore-side-close-smooth.png",
        "after_image": "renders/combined-cap-elbow-fore-side-close-smooth.png",
        "before_wire": "renders/before-combined-cap-elbow-fore-side-close-wire.png",
        "after_wire": "renders/combined-cap-elbow-fore-side-close-wire.png",
        "diagnostic_crop_pixels": {"x": [390, 500], "y": [300, 560]},
        "darkness_proxy": {"mean_rgb_below": 80, "before_pixels": int((before_region < 80).sum()),
                           "after_pixels": int((after_region < 80).sum()),
                           "proxy_scope": "Same-camera local crop includes the joint gap and adjacent shaded cloth/metal. It is supporting visual evidence, not a per-face segmentation."},
        "human_image_review": "The side close after-image still shows the exposed flat inner rim and an enlarged dark notch between couter and forearm. The cap-only retreat does not satisfy the visible closure criterion.",
        "outcome": "fail"
    }
    write_json(RUN / "qa/visual-diff.json", result)
    print("ELBOW_RIM_VISUAL_QA", json.dumps(result["darkness_proxy"]), flush=True)


if __name__ == "__main__":
    main()
