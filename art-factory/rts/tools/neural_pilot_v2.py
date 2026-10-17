"""One fixed-input TripoSR repair pilot with true 2k neural field texture queries.

No runtime publication, rembg session, pretrained DINO download, or new model
sampling is performed here. The upstream source and checkpoint remain pinned in
an independent cache; only the marching-cubes CPU extension is substituted.
"""

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image

from neural_pilot import install_isosurface_shim, prepare_input, sha256


def srgb_to_linear(value: np.ndarray) -> np.ndarray:
    """Decode sRGB bytes/normalized colors exactly once for comparison."""
    value = np.asarray(value, dtype=np.float32)
    return np.where(value <= 0.04045, value / 12.92, ((value + 0.055) / 1.055) ** 2.4)


def smooth_positions(vertices: np.ndarray, faces: np.ndarray, factor: float = 0.2) -> np.ndarray:
    """One mild Laplacian step using the triangular mesh's one-ring neighbors."""
    if not 0 <= factor <= 1:
        raise ValueError("factor must be in [0, 1]")
    vertices = np.asarray(vertices, dtype=np.float32)
    faces = np.asarray(faces, dtype=np.int64)
    edges = np.concatenate((faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]))
    sums = np.zeros_like(vertices)
    counts = np.zeros(len(vertices), dtype=np.int32)
    for source, destination in ((edges[:, 0], edges[:, 1]), (edges[:, 1], edges[:, 0])):
        np.add.at(sums, source, vertices[destination])
        np.add.at(counts, source, 1)
    average = sums / np.maximum(counts[:, None], 1)
    return vertices + factor * (average - vertices)


def rgb_statistics(image: Image.Image, mask: np.ndarray) -> dict:
    pixels = np.asarray(image.convert("RGB"), dtype=np.float32)[mask] / 255.0
    median = np.median(pixels, axis=0)
    return {
        "pixel_count": int(len(pixels)),
        "median_srgb": np.round(median, 5).tolist(),
        "median_linear": np.round(srgb_to_linear(median), 5).tolist(),
        "mean_srgb": np.round(pixels.mean(axis=0), 5).tolist(),
    }


def run(args) -> dict:
    import torch

    if not torch.cuda.is_available():
        raise RuntimeError("CUDA unavailable; v2 requires real GPU inference")
    install_isosurface_shim()
    sys.path.insert(0, str(args.upstream))
    import xatlas
    from tsr.bake_texture import make_atlas, rasterize_position_atlas
    from tsr.models.tokenizers import image as image_tokenizer
    from tsr.system import TSR

    def pinned_dino_config(repo_id, filename, **_kwargs):
        if repo_id != "facebook/dino-vitb16" or filename != "config.json":
            raise RuntimeError(f"Unexpected Hugging Face request: {repo_id}/{filename}")
        return str(args.dino_config)

    image_tokenizer.hf_hub_download = pinned_dino_config
    raw, candidate, qa = (args.run_dir / part for part in ("raw", "candidate", "qa"))
    for directory in (raw, candidate, qa):
        directory.mkdir(parents=True, exist_ok=True)
    prepared = raw / "prepared-gray.png"
    preprocess = prepare_input(args.input, prepared)
    timings = {}
    start = time.perf_counter()
    model = TSR.from_pretrained(str(args.weights), "config.yaml", "model.ckpt")
    model.renderer.set_chunk_size(args.chunk_size)
    model.to("cuda:0").eval()
    torch.cuda.synchronize()
    timings["load_seconds"] = round(time.perf_counter() - start, 3)
    start = time.perf_counter()
    with Image.open(prepared) as opened, torch.inference_mode():
        scene_codes = model([opened.convert("RGB")], device="cuda:0")
    torch.cuda.synchronize()
    timings["inference_seconds"] = round(time.perf_counter() - start, 3)
    start = time.perf_counter()
    with torch.inference_mode():
        mesh = model.extract_mesh(scene_codes, has_vertex_color=False, resolution=args.resolution)[0]
    torch.cuda.synchronize()
    timings["isosurface_seconds"] = round(time.perf_counter() - start, 3)
    before = np.asarray(mesh.vertices, dtype=np.float32).copy()
    after = smooth_positions(before, mesh.faces, factor=args.smooth_factor)
    displacement = np.linalg.norm(after - before, axis=1)
    mesh.vertices = after
    smooth = {
        "factor": args.smooth_factor,
        "iterations": 1,
        "mean_displacement": float(displacement.mean()),
        "max_displacement": float(displacement.max()),
        "before_bounds": [before.min(axis=0).tolist(), before.max(axis=0).tolist()],
        "after_bounds": mesh.bounds.tolist(),
    }

    # These are the same official xatlas/ModernGL UV and position-raster steps
    # as upstream bake_texture.py. Query only covered texels, in CUDA batches.
    start = time.perf_counter()
    padding = round(max(2, args.texture_resolution / 256))
    atlas = make_atlas(mesh, args.texture_resolution, padding)
    positions = rasterize_position_atlas(
        mesh, atlas["vmapping"], atlas["indices"], atlas["uvs"], args.texture_resolution, padding
    )
    timings["uv_and_position_raster_seconds"] = round(time.perf_counter() - start, 3)
    mask = positions[:, :, 3] > 0
    indices = np.flatnonzero(mask.ravel())
    flat_positions = positions.reshape(-1, 4)
    flat_colors = np.zeros((args.texture_resolution * args.texture_resolution, 4), dtype=np.uint8)
    start = time.perf_counter()
    with torch.inference_mode():
        for offset in range(0, len(indices), args.query_batch_size):
            batch_indices = indices[offset : offset + args.query_batch_size]
            points = torch.as_tensor(
                np.ascontiguousarray(flat_positions[batch_indices, :3]),
                dtype=torch.float32,
                device="cuda:0",
            )
            srgb = model.renderer.query_triplane(model.decoder, points, scene_codes[0])["color"]
            flat_colors[batch_indices, :3] = (
                srgb.clamp(0, 1).mul(255).round().byte().cpu().numpy()
            )
            flat_colors[batch_indices, 3] = 255
    torch.cuda.synchronize()
    timings["neural_texel_query_seconds"] = round(time.perf_counter() - start, 3)
    texture = Image.fromarray(flat_colors.reshape(args.texture_resolution, args.texture_resolution, 4), "RGBA")
    texture = texture.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    texture_path = candidate / "guard-neural-albedo-2048.png"
    texture.save(texture_path)
    uv_mesh_path = candidate / "guard-neural-uv.obj"
    xatlas.export(
        str(uv_mesh_path),
        mesh.vertices[atlas["vmapping"]],
        atlas["indices"],
        atlas["uvs"],
        mesh.vertex_normals[atlas["vmapping"]],
    )

    with Image.open(args.input) as original:
        source_rgba = original.convert("RGBA")
    source_stats = rgb_statistics(source_rgba, np.asarray(source_rgba.getchannel("A")) > 0)
    neural_stats = rgb_statistics(texture, np.asarray(texture.getchannel("A")) > 0)
    with Image.open(args.v1_texture) as old:
        old_rgba = old.convert("RGBA")
    v1_stats = rgb_statistics(old_rgba, np.asarray(old_rgba.getchannel("A")) > 0)
    record = {
        "preprocess": preprocess,
        "source": {
            "upstream_commit": "107cefdc244c39106fa830359024f6a2f1c78871",
            "weights_revision": "5b521936b01fbe1890f6f9baed0254ab6351c04a",
            "checkpoint_sha256": sha256(args.weights / "model.ckpt"),
            "dino_config_sha256": sha256(args.dino_config),
            "input_sha256": sha256(args.input),
        },
        "device": {
            "name": torch.cuda.get_device_name(0),
            "torch": torch.__version__,
            "cuda": torch.version.cuda,
            "capability": list(torch.cuda.get_device_capability(0)),
            "max_allocated_bytes": torch.cuda.max_memory_allocated(0),
        },
        "timings": timings,
        "geometry": {
            "resolution": args.resolution,
            "vertices": len(mesh.vertices),
            "triangles": len(mesh.faces),
            "watertight": bool(mesh.is_watertight),
            "smoothing": smooth,
            "uv_vertices": len(atlas["vmapping"]),
            "uv_mesh_sha256": sha256(uv_mesh_path),
        },
        "texture": {
            "size": [args.texture_resolution, args.texture_resolution],
            "covered_texels": len(indices),
            "coverage_fraction": round(len(indices) / (args.texture_resolution**2), 6),
            "query_batch_size": args.query_batch_size,
            "encoding": "TripoSR sigmoid RGB serialized directly as sRGB PNG; Blender sRGB image node decodes once to linear. No vertex-color bake or second gamma encode.",
            "sha256": sha256(texture_path),
            "source_visible_rgb": source_stats,
            "v1_baked_rgb": v1_stats,
            "v2_neural_rgb": neural_stats,
        },
    }
    report = qa / "inference-v2.json"
    report.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    return record


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--upstream", type=Path, required=True)
    parser.add_argument("--weights", type=Path, required=True)
    parser.add_argument("--dino-config", type=Path, required=True)
    parser.add_argument("--v1-texture", type=Path, required=True)
    parser.add_argument("--run-dir", type=Path, required=True)
    parser.add_argument("--no-remove-bg", action="store_true", required=True)
    parser.add_argument("--resolution", type=int, default=192)
    parser.add_argument("--texture-resolution", type=int, default=2048)
    parser.add_argument("--chunk-size", type=int, default=8192)
    parser.add_argument("--query-batch-size", type=int, default=32768)
    parser.add_argument("--smooth-factor", type=float, default=0.2)
    args = parser.parse_args()
    print(json.dumps(run(args), indent=2))


if __name__ == "__main__":
    main()
