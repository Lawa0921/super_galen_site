"""Prepare original horse/guard color maps for a compact mounted candidate."""

import hashlib
import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
RUN = ROOT / "runs" / "kingdom-knight" / "2026-10-05-v1"
INPUTS = RUN / "raw" / "inputs"
CANDIDATE = RUN / "candidate"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    CANDIDATE.mkdir(parents=True, exist_ok=True)
    source = CANDIDATE / "guard-projected-albedo-2048.png"  # pinned TripoSR CLI basename
    with Image.open(source) as image:
        assert image.size == (2048, 2048)
        rgba = np.asarray(image.convert("RGBA"))
    rgb = rgba[:, :, :3].astype(np.float32)
    # Remove the generated saddlecloth's baked navy hue so TeamCloth can
    # recolor the saddle panels blue or red. Coat, leather and metal stay RGB.
    blue = (rgb[:, :, 2] > rgb[:, :, 0] * 1.17) & (rgb[:, :, 2] > rgb[:, :, 1] * 1.09) & (rgba[:, :, 3] > 8)
    gray = np.dot(rgb, [0.2126, 0.7152, 0.0722])
    rgb[blue] = gray[blue, None]
    alpha = rgba[:, :, 3:4].astype(np.float32) / 255
    rgb = rgb * alpha + np.array([85, 59, 42], dtype=np.float32) * (1 - alpha)
    horse = CANDIDATE / "horse-body-1024-q90.jpg"
    Image.fromarray(np.uint8(np.clip(rgb, 0, 255)), "RGB").resize((1024, 1024), Image.Resampling.LANCZOS).save(horse, quality=90, subsampling=2, optimize=True)
    guard = CANDIDATE / "guard-body-1024-q90.jpg"
    cloth = CANDIDATE / "teamcloth-neutral-1024-q90.jpg"
    saddle = CANDIDATE / "teamcloth-saddle-weave-1024-q90.jpg"
    shutil.copyfile(INPUTS / "guard-body-1024-q90.jpg", guard)
    shutil.copyfile(INPUTS / "guard-teamcloth-neutral-1024-q90.jpg", cloth)
    shutil.copyfile(ROOT / "runs" / "kingdom-siege" / "2026-10-04-runtime-v1" / "candidate" / "textures" / "navy-cloth-basecolor.jpg", saddle)
    with Image.open(cloth) as image:
        texture = np.asarray(image.convert("RGB"), dtype=np.int16)
    cloth_spread = float(np.abs(texture[:, :, 0] - texture[:, :, 1]).mean() + np.abs(texture[:, :, 1] - texture[:, :, 2]).mean())
    report = {
        "source_horse_2048": str(source.relative_to(ROOT)),
        "source_horse_sha256": sha(source),
        "horse_baked_blue_texels_neutralized": int(blue.sum()),
        "horse_basecolor_1024": str(horse.relative_to(ROOT)),
        "horse_basecolor_sha256": sha(horse),
        "horse_basecolor_bytes": horse.stat().st_size,
        "guard_basecolor_1024_sha256": sha(guard),
        "guard_basecolor_bytes": guard.stat().st_size,
        "teamcloth_neutral_1024_sha256": sha(cloth),
        "teamcloth_neutral_1024_bytes": cloth.stat().st_size,
        "teamcloth_saddle_weave_1024_sha256": sha(saddle),
        "teamcloth_saddle_weave_1024_bytes": saddle.stat().st_size,
        "teamcloth_channel_spread": round(cloth_spread, 3),
        "runtime_publish_allowed": False,
    }
    qa = RUN / "qa"
    qa.mkdir(parents=True, exist_ok=True)
    (qa / "texture-prep.json").write_bytes(json.dumps(report, indent=2).encode("utf-8"))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
