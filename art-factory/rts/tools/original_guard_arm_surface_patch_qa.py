"""Independent numeric and neutral-contour audit of the bounded patch candidate."""
import hashlib
import json
from pathlib import Path
import sys

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / "art-factory/rts/runs/original-guard-arm-surface-patch/2026-10-05"
OLD = ROOT / "art-factory/rts/runs/original-guard-arm-articulation/2026-10-05"
sys.path.insert(0, str(Path(__file__).parent))
from original_guard_arm_articulate import mesh_checks


def main():
    data = json.loads((RUN / "candidate/original-guard-arm-articulation.json").read_text(encoding="utf8"))
    baseline = json.loads((OLD / "candidate/original-guard-arm-articulation.json").read_text(encoding="utf8"))
    patch = json.loads((RUN / "qa/source-patch.json").read_text(encoding="utf8"))
    poses = json.loads((RUN / "qa/pose-report.json").read_text(encoding="utf8"))
    result = {"status": "qa_failed", "runtime_publish_allowed": False, "components": {},
              "pose_status": poses["status"], "original_source_sha256": patch["original_source_sha256"]}
    for name, component in data["components"].items():
        v = np.asarray(component["vertices"], float)
        f = np.asarray(component["faces"], int)
        old = np.asarray(baseline["components"][name]["vertices"], float)
        half = len(v) // 2
        surface = f[np.all(f < half, axis=1)]
        normals = np.cross(v[surface[:, 1]] - v[surface[:, 0]], v[surface[:, 2]] - v[surface[:, 0]])
        normals /= np.linalg.norm(normals, axis=1)[:, None]
        displacement = v[half:] - v[:half]
        incidence = np.stack(np.where(np.any(surface[:, :, None] == np.arange(half)[None, None, :], axis=1)), axis=1)
        thickness = -np.sum(displacement[incidence[:, 1]] * normals[incidence[:, 0]], axis=1)
        thickness_magnitude = np.abs(thickness)
        move = np.linalg.norm(v[:half] - old[:half], axis=1)
        result["components"][name] = {"topology": mesh_checks(v, f),
            "outer_max_displacement_m": float(move.max()),
            "paired_inner_distance_min_m": float(np.min(np.linalg.norm(displacement, axis=1))),
            "incident_normal_thickness_magnitude_min_m": float(thickness_magnitude.min()),
            "incident_below_1_5mm": int(np.sum(thickness_magnitude < .0015)),
            "incident_above_2_5mm": int(np.sum(thickness_magnitude > .0025)),
            "incident_sign_opposite_median": int(np.sum(np.sign(thickness) != np.sign(np.median(thickness)))),
            "neutral_self_collision_pairs": poses["poses"]["neutral"]["self_collision_pairs"][name],
            "combined_self_collision_pairs": poses["poses"]["combined"]["self_collision_pairs"][name]}
    old_image = Image.open(OLD / "qa/renders/neutral.png").convert("RGB")
    new_image = Image.open(RUN / "qa/renders/neutral.png").convert("RGB")
    size = (600, 600)
    old_image = old_image.resize(size)
    new_image = new_image.resize(size)
    overlay = Image.blend(old_image, new_image, .5)
    sheet = Image.new("RGB", (1800, 640), (25, 28, 32))
    for i, (label, img) in enumerate((("BEFORE / rejected articulation", old_image),
                                       ("AFTER / source-guided patch", new_image),
                                       ("50% overlay / same camera", overlay))):
        sheet.paste(img, (i * 600, 40))
        ImageDraw.Draw(sheet).text((i * 600 + 15, 12), label, fill=(230, 230, 230))
    image_path = RUN / "qa/renders/neutral-before-after.png"
    sheet.save(image_path)
    result["contour_comparison_sha256"] = hashlib.sha256(image_path.read_bytes()).hexdigest()
    result["candidate_sha256"] = {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
        for p in (RUN / "candidate").glob("*") if p.is_file() and p.suffix != ".blend1"}
    out = RUN / "qa/geometry-audit.json"
    out.write_bytes((json.dumps(result, indent=2) + "\n").encode("utf8"))
    print(json.dumps({k: {"self": v["neutral_self_collision_pairs"],
        "min_thickness_mm": round(v["incident_normal_thickness_magnitude_min_m"] * 1000, 3),
        "watertight": v["topology"]["watertight"]} for k, v in result["components"].items()}))


if __name__ == "__main__":
    main()
