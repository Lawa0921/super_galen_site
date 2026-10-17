"""Project the original front/rear guard images onto the fixed v2 TripoSR UV mesh.

No TripoSR inference, weight loading, new geometry, exposure correction, or
sharpening occurs here. Side-facing UV texels retain the v2 neural color.
"""

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np
import trimesh
from PIL import Image

from neural_pilot import sha256
from neural_pilot_v2 import srgb_to_linear


def linear_to_srgb(value: np.ndarray) -> np.ndarray:
    value = np.asarray(value, dtype=np.float32)
    return np.where(value <= 0.0031308, value * 12.92, 1.055 * np.power(value, 1 / 2.4) - 0.055)


def projection_pixels(points: np.ndarray, bounds: np.ndarray, bbox: tuple, rear: bool) -> np.ndarray:
    """Orthographic +X/-X view. Camera image right is +Y/-Y respectively."""
    bounds = np.asarray(bounds, dtype=np.float32)
    points = np.asarray(points, dtype=np.float32)
    y = (points[:, 1] - bounds[0, 1]) / (bounds[1, 1] - bounds[0, 1])
    z = (points[:, 2] - bounds[0, 2]) / (bounds[1, 2] - bounds[0, 2])
    if rear:
        y = 1 - y
    left, top, right, bottom = bbox
    return np.stack((left + y * (right - left), bottom - z * (bottom - top)), axis=-1)


def projection_weight(signed_normal: np.ndarray, alpha: np.ndarray, depth_gap: np.ndarray) -> np.ndarray:
    """Reject silhouette edge spill, backsides, alpha holes, and occluded surfaces."""
    facing = np.clip((np.asarray(signed_normal) - 0.15) / 0.55, 0, 1) ** 1.5
    visible = np.clip((0.035 - np.asarray(depth_gap)) / 0.015, 0, 1)
    return facing * np.clip(np.asarray(alpha), 0, 1) * visible


def alpha_bbox(rgba: np.ndarray) -> tuple[int, int, int, int]:
    rows, cols = np.where(rgba[:, :, 3] > 16)
    if len(rows) == 0:
        raise ValueError("Projection reference has no visible alpha")
    return int(cols.min()), int(rows.min()), int(cols.max() + 1), int(rows.max() + 1)


def bilinear_rgba(rgba: np.ndarray, coords: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Premultiplied-alpha bilinear sampling prevents hidden RGB edge fringes."""
    h, w, _ = rgba.shape
    x = np.clip(coords[:, 0], 0, w - 1)
    y = np.clip(coords[:, 1], 0, h - 1)
    x0 = np.floor(x).astype(np.int32)
    y0 = np.floor(y).astype(np.int32)
    x1 = np.minimum(x0 + 1, w - 1)
    y1 = np.minimum(y0 + 1, h - 1)
    fx = (x - x0).astype(np.float32)
    fy = (y - y0).astype(np.float32)
    colors = np.zeros((len(coords), 3), dtype=np.float32)
    alpha = np.zeros(len(coords), dtype=np.float32)
    for px, py, coefficient in (
        (x0, y0, (1 - fx) * (1 - fy)),
        (x1, y0, fx * (1 - fy)),
        (x0, y1, (1 - fx) * fy),
        (x1, y1, fx * fy),
    ):
        sample = rgba[py, px].astype(np.float32) / 255.0
        weighted_alpha = sample[:, 3] * coefficient
        colors += sample[:, :3] * weighted_alpha[:, None]
        alpha += weighted_alpha
    np.divide(colors, alpha[:, None], out=colors, where=alpha[:, None] > 1e-6)
    alpha *= ((coords[:, 0] >= 0) & (coords[:, 0] < w) & (coords[:, 1] >= 0) & (coords[:, 1] < h))
    return colors, alpha


def projected_side(points, normals, reference, bounds, rear):
    coords = projection_pixels(points, bounds, alpha_bbox(reference), rear)
    h, w, _ = reference.shape
    px = np.clip(np.rint(coords[:, 0]).astype(np.int32), 0, w - 1)
    py = np.clip(np.rint(coords[:, 1]).astype(np.int32), 0, h - 1)
    depths = np.full((h, w), -np.inf if not rear else np.inf, dtype=np.float32)
    if rear:
        np.minimum.at(depths, (py, px), points[:, 0])
        gap = points[:, 0] - depths[py, px]
        signed_normal = -normals[:, 0]
    else:
        np.maximum.at(depths, (py, px), points[:, 0])
        gap = depths[py, px] - points[:, 0]
        signed_normal = normals[:, 0]
    sampled_rgb, sampled_alpha = bilinear_rgba(reference, coords)
    return sampled_rgb, projection_weight(signed_normal, sampled_alpha, gap), {
        "alpha_bbox": list(alpha_bbox(reference)),
        "visible_source_pixels": int(np.count_nonzero(reference[:, :, 3] > 16)),
    }


def run(args) -> dict:
    sys.path.insert(0, str(args.upstream))
    from tsr.bake_texture import rasterize_position_atlas

    start = time.perf_counter()
    mesh = trimesh.load(args.uv_mesh, process=False)
    if not isinstance(mesh, trimesh.Trimesh) or mesh.visual.uv is None:
        raise ValueError("Expected one fixed v2 OBJ mesh with UVs")
    size = args.texture_size
    with Image.open(args.neural_texture) as image:
        if image.size != (size, size):
            raise ValueError("Expected a fixed v2 2048 texture")
        base = np.flipud(np.asarray(image.convert("RGBA")))
    padding = round(max(2, size / 256))
    mapping = np.arange(len(mesh.vertices), dtype=np.int32)
    positions = rasterize_position_atlas(mesh, mapping, mesh.faces, mesh.visual.uv, size, padding)
    normal_mesh = trimesh.Trimesh(vertices=mesh.vertex_normals, faces=mesh.faces, process=False)
    normal_atlas = rasterize_position_atlas(normal_mesh, mapping, mesh.faces, mesh.visual.uv, size, padding)
    valid = (positions[:, :, 3] > 0) & (base[:, :, 3] > 0)
    ids = np.flatnonzero(valid.ravel())
    coords = positions.reshape(-1, 4)[ids, :3]
    normals = normal_atlas.reshape(-1, 4)[ids, :3]
    normals /= np.maximum(np.linalg.norm(normals, axis=1, keepdims=True), 1e-6)
    with Image.open(args.front) as image:
        front = np.asarray(image.convert("RGBA"))
    with Image.open(args.rear) as image:
        rear = np.asarray(image.convert("RGBA"))
    front_rgb, front_weight, front_meta = projected_side(coords, normals, front, mesh.bounds, rear=False)
    rear_rgb, rear_weight, rear_meta = projected_side(coords, normals, rear, mesh.bounds, rear=True)
    source_weight = np.clip(front_weight + rear_weight, 0, 1)
    base_flat = base.reshape(-1, 4)
    # Decode all source bytes once, combine irradiance-free RGB in linear light,
    # then encode the final glTF baseColor PNG once. No exposure multiplier.
    final = base_flat.copy()
    chunk_size = 200_000
    for offset in range(0, len(ids), chunk_size):
        take = slice(offset, offset + chunk_size)
        selected = ids[take]
        original = srgb_to_linear(base_flat[selected, :3].astype(np.float32) / 255)
        front_linear = srgb_to_linear(front_rgb[take])
        rear_linear = srgb_to_linear(rear_rgb[take])
        fw = front_weight[take, None]
        rw = rear_weight[take, None]
        mixed = original * (1 - fw - rw) + front_linear * fw + rear_linear * rw
        final[selected, :3] = np.rint(np.clip(linear_to_srgb(mixed), 0, 1) * 255).astype(np.uint8)
    candidate = args.run_dir / "candidate"
    qa = args.run_dir / "qa"
    candidate.mkdir(parents=True, exist_ok=True)
    qa.mkdir(parents=True, exist_ok=True)
    texture = Image.fromarray(np.flipud(final.reshape(size, size, 4)).copy(), "RGBA")
    target = candidate / "guard-projected-albedo-2048.png"
    texture.save(target)
    mask_colors = np.zeros((size * size, 4), dtype=np.uint8)
    mask_colors[ids, 0] = np.rint(front_weight * 255).astype(np.uint8)
    mask_colors[ids, 2] = np.rint(rear_weight * 255).astype(np.uint8)
    mask_colors[ids, 3] = 255
    Image.fromarray(np.flipud(mask_colors.reshape(size, size, 4)).copy(), "RGBA").save(qa / "projection-weights.png")
    report = {
        "method": "Fixed v2 OBJ/UV; +X front and -X rear orthographic alpha projection with face-normal and nearest-depth gating; +Y side remains neural; RGB blended in linear then encoded as sRGB PNG once",
        "no_model_inference": True,
        "no_geometry_edit": True,
        "no_exposure_or_sharpen": True,
        "source": {
            "front_path": str(args.front), "front_sha256": sha256(args.front), "front": front_meta,
            "rear_path": str(args.rear), "rear_sha256": sha256(args.rear), "rear": rear_meta,
            "uv_mesh_sha256": sha256(args.uv_mesh), "neural_texture_sha256": sha256(args.neural_texture),
        },
        "mesh": {"vertices_after_uv_split": len(mesh.vertices), "triangles": len(mesh.faces), "bounds": mesh.bounds.tolist()},
        "texture": {"size": [size, size], "covered_texels": len(ids), "front_weight_gt_half": int(np.count_nonzero(front_weight > 0.5)), "rear_weight_gt_half": int(np.count_nonzero(rear_weight > 0.5)), "neural_dominant_texels": int(np.count_nonzero(source_weight < 0.5)), "sha256": sha256(target)},
        "elapsed_seconds": round(time.perf_counter() - start, 3),
    }
    (qa / "projection-v3.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--front", type=Path, required=True)
    parser.add_argument("--rear", type=Path, required=True)
    parser.add_argument("--uv-mesh", type=Path, required=True)
    parser.add_argument("--neural-texture", type=Path, required=True)
    parser.add_argument("--upstream", type=Path, required=True)
    parser.add_argument("--run-dir", type=Path, required=True)
    parser.add_argument("--texture-size", type=int, default=2048)
    args = parser.parse_args()
    print("PILOT_PROJECTION_V3=" + json.dumps(run(args)))


if __name__ == "__main__":
    main()
