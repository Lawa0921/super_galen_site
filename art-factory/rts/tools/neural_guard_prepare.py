"""Prepare traceable guard TeamCloth and JPEG delivery images from v3 PNG."""

import argparse
import json
import shutil
from pathlib import Path

import numpy as np
import trimesh
from PIL import Image

from neural_pilot import sha256


def blue_cloth_mask(rgb: np.ndarray) -> np.ndarray:
    rgb = np.asarray(rgb, dtype=np.float32)
    return (rgb[..., 2] > rgb[..., 0] * 1.35) & (rgb[..., 2] > rgb[..., 1] * 1.18) & (rgb[..., 2] > 45)


def sample_rgb(image: np.ndarray, uv: np.ndarray) -> np.ndarray:
    height, width = image.shape[:2]
    x = np.clip(np.rint(uv[..., 0] * (width - 1)).astype(int), 0, width - 1)
    y = np.clip(np.rint((1 - uv[..., 1]) * (height - 1)).astype(int), 0, height - 1)
    return image[y, x, :3]


def run(args):
    raw, candidate, qa = (args.run_dir / name for name in ("raw", "candidate", "qa"))
    for directory in (raw, candidate, qa):
        directory.mkdir(parents=True, exist_ok=True)
    source = np.asarray(Image.open(args.albedo).convert("RGBA"))
    if source.shape != (2048, 2048, 4):
        raise ValueError("Expected fixed 2048 v3 RGBA atlas")
    shutil.copy2(args.albedo, raw / "body-projected-albedo-2048.png")
    blue = blue_cloth_mask(source[:, :, :3]) & (source[:, :, 3] > 0)
    neutral = source.copy()
    luminance = np.clip(0.2126 * source[:, :, 0] + 0.7152 * source[:, :, 1] + 0.0722 * source[:, :, 2], 0, 255).astype(np.uint8)
    neutral_value = np.where(blue, source[:, :, 2], luminance)
    neutral[:, :, :3] = neutral_value[:, :, None]
    neutral_file = raw / "teamcloth-neutral-2048.png"
    Image.fromarray(neutral, "RGBA").save(neutral_file)

    mesh = trimesh.load(args.uv_mesh, process=False)
    if not isinstance(mesh, trimesh.Trimesh) or mesh.visual.uv is None:
        raise ValueError("Expected fixed v2 OBJ UV mesh")
    face_uv = mesh.visual.uv[mesh.faces]
    # Inset samples keep chart-edge gold trim and isolated steel highlights from
    # determining the cloth face. A majority of four samples is required.
    barycentric = np.array([[1 / 3, 1 / 3, 1 / 3], [0.65, 0.175, 0.175], [0.175, 0.65, 0.175], [0.175, 0.175, 0.65]], dtype=np.float32)
    points = np.einsum("s v, f v c -> f s c", barycentric, face_uv)
    votes = blue_cloth_mask(sample_rgb(source, points)).sum(axis=1)
    cloth_faces = np.flatnonzero(votes >= 2).tolist()
    (candidate / "cloth-faces.json").write_text(json.dumps(cloth_faces) + "\n", encoding="utf-8", newline="\n")

    images = {}
    for resolution in (2048, 1024):
        for label, rgba in (("body", source), ("teamcloth-neutral", neutral)):
            rgb_image = Image.fromarray(rgba[:, :, :3], "RGB")
            if resolution != 2048:
                rgb_image = rgb_image.resize((resolution, resolution), Image.Resampling.LANCZOS)
            path = candidate / f"{label}-{resolution}-q90.jpg"
            rgb_image.save(path, format="JPEG", quality=90, optimize=True, subsampling=0)
            images[f"{label}-{resolution}"] = {"path": str(path), "bytes": path.stat().st_size, "sha256": sha256(path)}
    record = {
        "source_albedo_sha256": sha256(args.albedo),
        "fixed_uv_mesh_sha256": sha256(args.uv_mesh),
        "raw_png_sha256": sha256(raw / "body-projected-albedo-2048.png"),
        "neutral_png_sha256": sha256(neutral_file),
        "blue_texels": int(blue.sum()),
        "cloth_faces": len(cloth_faces),
        "total_faces": len(mesh.faces),
        "images": images,
    }
    (qa / "material-prep.json").write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8", newline="\n")
    return record


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--albedo", type=Path, required=True)
    parser.add_argument("--uv-mesh", type=Path, required=True)
    parser.add_argument("--run-dir", type=Path, required=True)
    print("GUARD_PREP=" + json.dumps(run(parser.parse_args())))


if __name__ == "__main__":
    main()
