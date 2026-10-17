"""Check generated siege stud offsets on both outer wheel sides."""

from __future__ import annotations

import json
import os
from pathlib import Path

import bpy


def main() -> None:
    run = Path(os.environ["PROPS_RUN"]).resolve()
    rows = []
    for lod in (0, 1):
        source = run / "raw" / f"siege-lod{lod}.blend"
        bpy.ops.wm.open_mainfile(filepath=str(source))
        studs = [obj for obj in bpy.data.objects if obj.name.startswith("Peened tyre stud")]
        if lod == 1 and studs:
            raise AssertionError("LOD1 unexpectedly contains tyre studs")
        if lod == 0 and len(studs) != 32:
            raise AssertionError(f"LOD0 stud count is {len(studs)}, expected 32")
        by_wheel = {}
        for obj in studs:
            parent = obj.parent.name if obj.parent else ""
            by_wheel.setdefault(parent, []).append(float(obj.location.x))
        if lod == 0:
            if set(by_wheel) != {"WheelPivot_FL", "WheelPivot_FR", "WheelPivot_RL", "WheelPivot_RR"}:
                raise AssertionError(f"Unexpected stud wheel parents: {sorted(by_wheel)}")
            for wheel, xs in by_wheel.items():
                expected = -0.0245 if wheel.endswith("L") else 0.0245
                if any(abs(x - expected) > 1e-6 for x in xs):
                    raise AssertionError(f"{wheel} stud x values {xs} expected {expected}")
        rows.append({"lod": lod, "stud_count": len(studs), "stud_x_by_wheel": by_wheel})
    output = run / "qa" / "siege-stud-qa.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    report = {"status": "passed", "rows": rows, "expected_outer_offset_m": 0.0245,
              "runtime_publish_allowed": False}
    output.write_bytes((json.dumps(report, indent=2) + "\n").encode("utf-8"))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
