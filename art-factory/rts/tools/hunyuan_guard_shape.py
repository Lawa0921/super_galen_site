"""Fail-closed preflight for the bounded original-guard Hunyuan3D-2.1 pilot.

This tool intentionally performs no network access.  It verifies the approved source
image and the exact pinned checkpoint before a separate, explicitly scheduled GPU
inference step is allowed to begin.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

from PIL import Image


DEFAULT_SOURCE_SHA256 = "42f9d67e25d0fc1530554c6a25d461c51a47aa2ccf44cd7a5ec4df67aeaf6d0b"
DEFAULT_WEIGHT_SHA256 = "6b519fc7242f78e9b5f47ea4d55668fe3d944a2d27332f4ca68d29a6ff603f5e"
DEFAULT_WEIGHT_BYTES = 7_366_389_768


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def inspect_source(path: Path, expected_sha256: str) -> dict[str, Any]:
    actual_sha256 = file_sha256(path)
    with Image.open(path) as image:
        rgba = image.convert("RGBA")
        alpha = rgba.getchannel("A")
        histogram = alpha.histogram()
        total = rgba.width * rgba.height
        transparent = sum(histogram[:8])
        opaque = sum(histogram[248:])
        return {
            "path": str(path),
            "sha256": actual_sha256,
            "expected_sha256": expected_sha256,
            "verified": actual_sha256 == expected_sha256,
            "mode": image.mode,
            "dimensions": [rgba.width, rgba.height],
            "transparent_fraction": transparent / total,
            "opaque_fraction": opaque / total,
            "has_usable_alpha_cutout": transparent > 0 and opaque > 0,
        }


def inspect_weights(path: Path, expected_sha256: str, expected_bytes: int) -> dict[str, Any]:
    if not path.is_file():
        return {
            "path": str(path),
            "exists": False,
            "expected_sha256": expected_sha256,
            "expected_bytes": expected_bytes,
            "verified": False,
        }
    actual_bytes = path.stat().st_size
    actual_sha256 = file_sha256(path)
    return {
        "path": str(path),
        "exists": True,
        "actual_sha256": actual_sha256,
        "expected_sha256": expected_sha256,
        "actual_bytes": actual_bytes,
        "expected_bytes": expected_bytes,
        "verified": actual_bytes == expected_bytes and actual_sha256 == expected_sha256,
    }


def write_report(run_dir: Path, report: dict[str, Any]) -> Path:
    report_path = run_dir / "qa" / "preflight.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n"
    )
    return report_path


def inference_plan(args: argparse.Namespace) -> dict[str, Any]:
    return {
        "asset_id": args.asset_id,
        "model_root": str(args.model_root),
        "upstream_source": str(args.upstream),
        "source": str(args.source),
        "seed": args.seed,
        "num_inference_steps": args.num_inference_steps,
        "guidance_scale": args.guidance_scale,
        "octree_resolution": args.octree_resolution,
        "num_chunks": args.num_chunks,
        "mc_algorithm": "mc",
        "surface_extraction": "scikit-image CPU marching cubes",
        "precision": "float16",
        "shape_only": True,
        "texture_generation": False,
        "runtime_publish_allowed": False,
    }


def write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")


def run_inference(args: argparse.Namespace, plan: dict[str, Any]) -> int:
    report_path = args.run_dir / "qa" / "inference.json"
    started = time.perf_counter()
    report: dict[str, Any] = {
        **plan,
        "status": "inference_started",
        "candidate_created": False,
    }
    try:
        package_root = args.upstream / "hy3dshape"
        if not package_root.is_dir():
            raise FileNotFoundError("pinned hy3dshape package root is missing")
        sys.path.insert(0, str(package_root))
        os.environ["HF_HUB_OFFLINE"] = "1"

        import torch
        import trimesh
        from hy3dshape.pipelines import Hunyuan3DDiTFlowMatchingPipeline

        if not torch.cuda.is_available():
            raise RuntimeError("CUDA is unavailable")
        torch.cuda.empty_cache()
        torch.cuda.reset_peak_memory_stats()
        free_before, total_memory = torch.cuda.mem_get_info()
        pipeline = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(
            str(args.model_root),
            device="cuda",
            dtype=torch.float16,
            use_safetensors=False,
            variant="fp16",
            subfolder="hunyuan3d-dit-v2-1",
        )
        generator = torch.Generator(device="cuda").manual_seed(args.seed)
        mesh = pipeline(
            image=str(args.source),
            num_inference_steps=args.num_inference_steps,
            guidance_scale=args.guidance_scale,
            generator=generator,
            octree_resolution=args.octree_resolution,
            num_chunks=args.num_chunks,
            mc_algo="mc",
        )[0]
        if not isinstance(mesh, trimesh.Trimesh):
            raise TypeError("shape pipeline did not return a Trimesh")

        raw_path = args.run_dir / "raw" / "rawmesh.ply"
        candidate_path = args.run_dir / "candidate" / "candidate.glb"
        raw_path.parent.mkdir(parents=True, exist_ok=True)
        candidate_path.parent.mkdir(parents=True, exist_ok=True)
        mesh.export(raw_path)
        mesh.export(candidate_path)
        torch.cuda.synchronize()
        free_after, _ = torch.cuda.mem_get_info()
        report.update(
            status="candidate",
            candidate_created=True,
            raw_mesh=str(raw_path),
            candidate=str(candidate_path),
            vertices=int(len(mesh.vertices)),
            faces=int(len(mesh.faces)),
            connected_components=int(len(mesh.split(only_watertight=False))),
            watertight=bool(mesh.is_watertight),
            bounds=mesh.bounds.tolist(),
            elapsed_seconds=time.perf_counter() - started,
            cuda={
                "torch": torch.__version__,
                "device": torch.cuda.get_device_name(0),
                "capability": list(torch.cuda.get_device_capability(0)),
                "total_bytes": int(total_memory),
                "free_before_bytes": int(free_before),
                "free_after_bytes": int(free_after),
                "peak_allocated_bytes": int(torch.cuda.max_memory_allocated()),
                "peak_reserved_bytes": int(torch.cuda.max_memory_reserved()),
            },
        )
        write_json(report_path, report)
        print(json.dumps({"status": "candidate", "candidate": str(candidate_path)}))
        return 0
    except Exception as error:
        report.update(
            status="inference_failed",
            error_type=type(error).__name__,
            elapsed_seconds=time.perf_counter() - started,
        )
        write_json(report_path, report)
        print(json.dumps({"status": "inference_failed", "error_type": type(error).__name__}))
        return 5


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--asset-id", default="original-guard-shape")
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--weights", type=Path, required=True)
    parser.add_argument("--run-dir", type=Path, required=True)
    parser.add_argument("--expected-source-sha256", default=DEFAULT_SOURCE_SHA256)
    parser.add_argument("--expected-weight-sha256", default=DEFAULT_WEIGHT_SHA256)
    parser.add_argument("--expected-weight-bytes", type=int, default=DEFAULT_WEIGHT_BYTES)
    parser.add_argument("--model-root", type=Path)
    parser.add_argument("--upstream", type=Path)
    parser.add_argument("--seed", type=int, default=20261005)
    parser.add_argument("--num-inference-steps", type=int, default=50)
    parser.add_argument("--guidance-scale", type=float, default=5.0)
    parser.add_argument("--octree-resolution", type=int, default=384)
    parser.add_argument("--num-chunks", type=int, default=8000)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--preflight-only", action="store_true")
    mode.add_argument("--plan-only", action="store_true")
    mode.add_argument("--run-inference", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    source = inspect_source(args.source, args.expected_source_sha256)
    weights = inspect_weights(args.weights, args.expected_weight_sha256, args.expected_weight_bytes)

    blocked_gate = None
    if not source["verified"]:
        blocked_gate = "source_hash_mismatch"
    elif not source["has_usable_alpha_cutout"]:
        blocked_gate = "source_alpha_invalid"
    elif not weights["exists"]:
        blocked_gate = "weights_missing"
    elif weights.get("actual_bytes") != weights["expected_bytes"]:
        blocked_gate = "weights_size_mismatch"
    elif weights.get("actual_sha256") != weights["expected_sha256"]:
        blocked_gate = "weights_hash_mismatch"

    report = {
        "asset_id": args.asset_id,
        "status": "environment_blocked" if blocked_gate else "ready_for_inference",
        "blocked_gate": blocked_gate,
        "source": source,
        "weights": weights,
        "shape_only": True,
        "mc_algorithm": "scikit-image CPU marching cubes",
        "runtime_publish_allowed": False,
        "candidate_created": False,
    }
    report_path = write_report(args.run_dir, report)
    if blocked_gate:
        print(json.dumps({"status": report["status"], "report": str(report_path)}))
        return 3
    if args.preflight_only:
        print(json.dumps({"status": report["status"], "report": str(report_path)}))
        return 0
    if args.model_root is None or args.upstream is None:
        raise SystemExit("--model-root and --upstream are required for plan or inference")
    plan = inference_plan(args)
    write_json(args.run_dir / "qa" / "inference-plan.json", plan)
    if args.plan_only:
        print(json.dumps({"status": "ready_for_inference", "plan": "qa/inference-plan.json"}))
        return 0
    return run_inference(args, plan)


if __name__ == "__main__":
    raise SystemExit(main())
