"""Matched-camera assessment of the source-derived lip and transition shots."""
import json

import numpy as np
from PIL import Image

from original_guard_arm_hinge import write_json
from original_guard_elbow_lip import RUN


def main():
    renders = RUN / "qa/renders"
    before = np.asarray(Image.open(renders / "before-combined-cap-elbow-fore-side-close-smooth.png"))[:, :, :3]
    after = np.asarray(Image.open(renders / "combined-cap-elbow-fore-side-close-smooth.png"))[:, :, :3]
    if before.shape != after.shape or before.shape[:2] != (900, 900):
        raise ValueError("Same-camera close images are missing or mismatched")
    regions = {"upper_black_slot": (390, 500, 270, 365),
               "contact_lower_slot": (390, 500, 365, 575)}
    pixel_proxy = {}
    for label, (x0, x1, y0, y1) in regions.items():
        old = before[y0:y1, x0:x1].mean(axis=2)
        new = after[y0:y1, x0:x1].mean(axis=2)
        pixel_proxy[label] = {"crop_xyxy_px": [x0, y0, x1, y1],
                              "before_dark_lt80_px": int((old < 80).sum()),
                              "after_dark_lt80_px": int((new < 80).sum())}
    strict = json.loads((RUN / "qa/strict-pose-report.json").read_text())
    result = {
        "status": "qa_failed",
        "runtime_publish_allowed": False,
        "matched_camera": "target=(.375,.036,1.195), offset=(1.6,0,.2), orthographic_scale=.11, 900px; same material and light setup",
        "before_close_smooth": "renders/before-combined-cap-elbow-fore-side-close-smooth.png",
        "after_close_smooth": "renders/combined-cap-elbow-fore-side-close-smooth.png",
        "before_close_wire": "renders/before-combined-cap-elbow-fore-side-close-wire.png",
        "after_close_wire": "renders/combined-cap-elbow-fore-side-close-wire.png",
        "pixel_proxy": pixel_proxy,
        "proxy_limit": "Dark-pixel counts include shaded armor and cloth, so they are supporting evidence only; the image itself determines the visible notch and tab verdict.",
        "image_review": "The lower part of the black gap shrinks, but the upper black slot remains above the local lip. The new extension reads as a blunt straight protruding tab in combined-side view, not an integrated armor overlap. At 60 and 75 degrees, close views show that the tab protrudes through the couter silhouette.",
        "new_strict_surface_crossing_pairs_at_bend60": 2,
        "new_strict_surface_crossing_pairs_at_bend75": 1,
        "new_crossing_side_or_action_ray_unoccluded": all(
            sample["views"]["side"]["nearest_occluder"] is None or
            sample["views"]["action_close"]["nearest_occluder"] is None
            for sample in strict["new_surface_crossing_samples"]),
        "transition_evidence": ["renders/bend60-side-close-new-crossing-smooth.png",
                                "renders/bend60-side-close-new-crossing-wire.png",
                                "renders/bend75-side-close-new-crossing-smooth.png",
                                "renders/bend60-action-close-new-crossing-smooth.png"],
        "outcome": "fail"
    }
    write_json(RUN / "qa/visual-diff.json", result)
    print("ELBOW_LIP_VISUAL_QA", json.dumps(pixel_proxy), flush=True)


if __name__ == "__main__":
    main()
