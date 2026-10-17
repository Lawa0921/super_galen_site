"""Behavior tests for the bounded Hunyuan guard shape runner."""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image


SCRIPT = Path(__file__).with_name("hunyuan_guard_shape.py")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


class GuardShapePreflightTests(unittest.TestCase):
    def make_source(self, root: Path) -> Path:
        source = root / "input.png"
        image = Image.new("RGBA", (8, 8), (20, 30, 40, 0))
        for x in range(2, 6):
            for y in range(1, 7):
                image.putpixel((x, y), (160, 140, 120, 255))
        image.save(source)
        return source

    def run_preflight(
        self,
        root: Path,
        source: Path,
        weights: Path,
        expected_weight_sha: str,
        expected_weight_bytes: int,
        asset_id: str | None = None,
    ) -> subprocess.CompletedProcess[str]:
        run_dir = root / "run"
        return subprocess.run(
            [
                sys.executable,
                str(SCRIPT),
                "--preflight-only",
                "--source",
                str(source),
                "--weights",
                str(weights),
                "--run-dir",
                str(run_dir),
                "--expected-source-sha256",
                sha256(source),
                "--expected-weight-sha256",
                expected_weight_sha,
                "--expected-weight-bytes",
                str(expected_weight_bytes),
                *(["--asset-id", asset_id] if asset_id is not None else []),
            ],
            text=True,
            capture_output=True,
            check=False,
        )

    def test_missing_weights_fail_closed_and_write_blocked_report(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = self.make_source(root)
            result = self.run_preflight(root, source, root / "missing.ckpt", "0" * 64, 10)

            self.assertEqual(result.returncode, 3, result.stderr)
            report = json.loads((root / "run" / "qa" / "preflight.json").read_text("utf-8"))
            self.assertEqual(report["status"], "environment_blocked")
            self.assertEqual(report["blocked_gate"], "weights_missing")
            self.assertTrue(report["source"]["verified"])
            self.assertFalse(report["runtime_publish_allowed"])
            self.assertFalse((root / "run" / "candidate" / "candidate.glb").exists())

    def test_wrong_weight_hash_is_rejected_before_inference(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = self.make_source(root)
            weights = root / "model.fp16.ckpt"
            weights.write_bytes(b"wrong")
            result = self.run_preflight(root, source, weights, "1" * 64, len(b"wrong"))

            self.assertEqual(result.returncode, 3, result.stderr)
            report = json.loads((root / "run" / "qa" / "preflight.json").read_text("utf-8"))
            self.assertEqual(report["blocked_gate"], "weights_hash_mismatch")
            self.assertEqual(report["weights"]["actual_sha256"], sha256(weights))
            self.assertFalse(report["runtime_publish_allowed"])

    def test_verified_source_and_weights_are_ready_without_creating_candidate(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = self.make_source(root)
            weights = root / "model.fp16.ckpt"
            weights.write_bytes(b"fixture-weights")
            result = self.run_preflight(
                root,
                source,
                weights,
                sha256(weights),
                weights.stat().st_size,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            report = json.loads((root / "run" / "qa" / "preflight.json").read_text("utf-8"))
            self.assertEqual(report["status"], "ready_for_inference")
            self.assertEqual(report["asset_id"], "original-guard-shape")
            self.assertGreater(report["source"]["opaque_fraction"], 0.0)
            self.assertGreater(report["source"]["transparent_fraction"], 0.0)
            self.assertFalse(report["runtime_publish_allowed"])
            self.assertFalse((root / "run" / "candidate" / "candidate.glb").exists())

    def test_plan_only_records_bounded_shape_settings_without_loading_model(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = self.make_source(root)
            model_root = root / "models" / "Hunyuan3D-2.1"
            weights = model_root / "hunyuan3d-dit-v2-1" / "model.fp16.ckpt"
            weights.parent.mkdir(parents=True)
            weights.write_bytes(b"fixture-weights")
            upstream = root / "source"
            upstream.mkdir()

            result = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT),
                    "--plan-only",
                    "--asset-id",
                    "original-guard-right-grip-shape",
                    "--source",
                    str(source),
                    "--weights",
                    str(weights),
                    "--model-root",
                    str(model_root),
                    "--upstream",
                    str(upstream),
                    "--run-dir",
                    str(root / "run"),
                    "--expected-source-sha256",
                    sha256(source),
                    "--expected-weight-sha256",
                    sha256(weights),
                    "--expected-weight-bytes",
                    str(weights.stat().st_size),
                ],
                text=True,
                capture_output=True,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            plan = json.loads((root / "run" / "qa" / "inference-plan.json").read_text("utf-8"))
            self.assertEqual(plan["seed"], 20261005)
            self.assertEqual(plan["asset_id"], "original-guard-right-grip-shape")
            self.assertEqual(plan["num_inference_steps"], 50)
            self.assertEqual(plan["octree_resolution"], 384)
            self.assertEqual(plan["mc_algorithm"], "mc")
            self.assertEqual(plan["precision"], "float16")
            self.assertTrue(plan["shape_only"])
            self.assertFalse(plan["runtime_publish_allowed"])
            self.assertFalse((root / "run" / "candidate" / "candidate.glb").exists())

    def test_component_id_is_preserved_even_when_weights_fail(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); source=self.make_source(root)
            result=self.run_preflight(root,source,root/'missing.ckpt','0'*64,10,'original-guard-right-grip-shape')
            self.assertEqual(result.returncode,3,result.stderr)
            report=json.loads((root/'run/qa/preflight.json').read_text('utf-8'))
            self.assertEqual(report['asset_id'],'original-guard-right-grip-shape')
            self.assertEqual(report['blocked_gate'],'weights_missing')


if __name__ == "__main__":
    unittest.main()
