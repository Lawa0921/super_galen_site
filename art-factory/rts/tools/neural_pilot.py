"""Run one pinned TripoSR pilot without rembg or a compiled torchmcubes extension.

The upstream TripoSR checkout and MIT checkpoint live outside this repository.
The isolated compatibility shim replaces only mesh isosurface extraction with
PyMCubes' BSD-3 CPU marching cubes; network inference and density/color queries
still run on CUDA.
"""

import argparse
import hashlib
import json
import sys
import time
import types
from pathlib import Path

from PIL import Image


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def prepare_input(source: Path, target: Path, size: int = 512, foreground_ratio: float = 0.85) -> dict:
    """Center the visible alpha cutout on TripoSR's neutral gray RGB canvas."""
    if not 0 < foreground_ratio <= 1:
        raise ValueError("foreground_ratio must be in (0, 1]")
    with Image.open(source) as opened:
        if "A" not in opened.getbands() and "transparency" not in opened.info:
            raise ValueError("input must have an alpha channel")
        image = opened.convert("RGBA")
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("input has no visible pixels")
    cutout = image.crop(bbox)
    scale = size * foreground_ratio / max(cutout.size)
    width = max(1, round(cutout.width * scale))
    height = max(1, round(cutout.height * scale))
    cutout = cutout.resize((width, height), Image.Resampling.LANCZOS)
    left, top = (size - width) // 2, (size - height) // 2
    background = Image.new("RGBA", (size, size), (127, 127, 127, 255))
    background.alpha_composite(cutout, (left, top))
    target.parent.mkdir(parents=True, exist_ok=True)
    background.convert("RGB").save(target)
    return {
        "source_size": list(image.size),
        "source_bbox": list(bbox),
        "prepared_size": [size, size],
        "prepared_bbox": [left, top, left + width, top + height],
        "foreground_ratio": foreground_ratio,
        "background_rgb": [127, 127, 127],
        "source_sha256": sha256(source),
        "prepared_sha256": sha256(target),
    }


def install_isosurface_shim() -> None:
    """Satisfy upstream imports while replacing CUDA-extension mesh extraction."""
    import glob
    import importlib.util

    import numpy as np
    import torch

    # The PyMCubes package initializer imports scipy for its unused smoothing
    # helpers. Load only the tiny, prebuilt marching-cubes extension instead.
    extension = glob.glob(str(Path(sys.prefix) / "Lib" / "site-packages" / "mcubes" / "_mcubes*.pyd"))
    if len(extension) != 1:
        raise RuntimeError("Expected one PyMCubes CPU extension in the isolated venv")
    spec = importlib.util.spec_from_file_location("_mcubes", extension[0])
    cpu_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(cpu_module)

    module = types.ModuleType("torchmcubes")

    def marching_cubes(volume, threshold):
        array = volume.detach().float().cpu().numpy()
        vertices, faces = cpu_module.marching_cubes(array, threshold)
        # Upstream flips the torchmcubes vertex axis order after this call.
        vertices = np.ascontiguousarray(vertices[:, ::-1], dtype=np.float32)
        return torch.from_numpy(vertices), torch.from_numpy(faces.astype(np.int64))

    module.marching_cubes = marching_cubes
    sys.modules["torchmcubes"] = module
    # tsr.utils imports rembg even when background removal is disabled.
    # An empty shim makes accidental new_session use fail instead of downloading.
    sys.modules["rembg"] = types.ModuleType("rembg")


def infer(prepared: Path, upstream: Path, weights: Path, dino_config: Path, output: Path, resolution: int, chunk_size: int) -> dict:
    import torch

    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is unavailable; refusing to silently run CPU inference")
    install_isosurface_shim()
    sys.path.insert(0, str(upstream))
    from tsr.system import TSR
    from tsr.models.tokenizers import image as image_tokenizer

    def pinned_dino_config(repo_id, filename, **_kwargs):
        if repo_id != "facebook/dino-vitb16" or filename != "config.json":
            raise RuntimeError(f"Unexpected Hugging Face request: {repo_id}/{filename}")
        return str(dino_config)

    image_tokenizer.hf_hub_download = pinned_dino_config

    timings = {}
    started = time.perf_counter()
    model = TSR.from_pretrained(str(weights), config_name="config.yaml", weight_name="model.ckpt")
    model.renderer.set_chunk_size(chunk_size)
    model.to("cuda:0").eval()
    torch.cuda.synchronize()
    timings["load_seconds"] = round(time.perf_counter() - started, 3)

    with Image.open(prepared) as opened:
        image = opened.convert("RGB")
    started = time.perf_counter()
    with torch.inference_mode():
        scene_codes = model([image], device="cuda:0")
    torch.cuda.synchronize()
    timings["inference_seconds"] = round(time.perf_counter() - started, 3)

    started = time.perf_counter()
    with torch.inference_mode():
        mesh = model.extract_mesh(scene_codes, has_vertex_color=True, resolution=resolution)[0]
    torch.cuda.synchronize()
    timings["mesh_and_color_seconds"] = round(time.perf_counter() - started, 3)
    output.parent.mkdir(parents=True, exist_ok=True)
    mesh.export(output)
    return {
        "device": torch.cuda.get_device_name(0),
        "torch_version": torch.__version__,
        "torch_cuda_version": torch.version.cuda,
        "cuda_capability": list(torch.cuda.get_device_capability(0)),
        "cuda_max_allocated_bytes": torch.cuda.max_memory_allocated(0),
        "timings": timings,
        "resolution": resolution,
        "chunk_size": chunk_size,
        "mesh": {
            "vertices": int(len(mesh.vertices)),
            "faces": int(len(mesh.faces)),
            "bounds": mesh.bounds.tolist(),
            "watertight": bool(mesh.is_watertight),
            "file_sha256": sha256(output),
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--upstream", type=Path, required=True)
    parser.add_argument("--weights", type=Path, required=True)
    parser.add_argument("--dino-config", type=Path, required=True)
    parser.add_argument("--run-dir", type=Path, required=True)
    parser.add_argument("--no-remove-bg", action="store_true", required=True)
    parser.add_argument("--resolution", type=int, default=192)
    parser.add_argument("--chunk-size", type=int, default=8192)
    args = parser.parse_args()
    prepared = args.run_dir / "raw" / "prepared-gray.png"
    candidate = args.run_dir / "candidate" / "guard-vertex-color.glb"
    record = {"preprocess": prepare_input(args.input, prepared)}
    record["inference"] = infer(prepared, args.upstream, args.weights, args.dino_config, candidate, args.resolution, args.chunk_size)
    record["model"] = {
        "checkpoint_sha256": sha256(args.weights / "model.ckpt"),
        "config_sha256": sha256(args.weights / "config.yaml"),
        "dino_config_sha256": sha256(args.dino_config),
    }
    report = args.run_dir / "qa" / "inference.json"
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(json.dumps(record, indent=2), encoding="utf-8")
    print(json.dumps(record, indent=2))


if __name__ == "__main__":
    main()
