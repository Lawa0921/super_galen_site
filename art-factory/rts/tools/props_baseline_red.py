"""Lock the pre-repair defects for the siege and rock asset scope."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path


RUN = Path(__file__).resolve().parents[1] / "runs" / "all-models" / "2026-10-14-props"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    full = json.loads((RUN / "qa" / "baseline" / "floor-gate-full.json").read_bytes())
    failures = [row for row in full["failures"] if row["id"] == "siege"]
    if {row["lod"] for row in failures} != {0, 1} or {row["clip"] for row in failures} != {"Death"}:
        raise AssertionError(f"Expected siege Death RED on both LODs, got {failures!r}")
    result = {
        "status": "failed",
        "scope": ["siege-lod0", "siege-lod1", "rock"],
        "reason": "pre-repair baseline intentionally exposes siege Death floor crossings",
        "siege_floor_failures": failures,
        "before_sha256": {
            name: sha256(RUN / "raw" / "before" / name)
            for name in ("siege.glb", "siege-lod1.glb", "rock.glb")
        },
        "rock_visual_evidence": sorted(path.name for path in (RUN / "qa" / "baseline").glob("rock-*.png")),
        "runtime_publish_allowed": False,
    }
    output = RUN / "qa" / "baseline" / "props-red.json"
    output.write_bytes((json.dumps(result, indent=2) + "\n").encode("utf-8"))
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
