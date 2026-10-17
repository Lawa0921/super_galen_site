"""Split the generated guard profile pair without painting source pixels."""
from pathlib import Path
import hashlib
import json

from PIL import Image, __version__ as pillow_version

ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / "art-factory/rts/runs/original-guard-materials/2026-10-05"


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    source = RUN / "raw/side-reference-pair.png"
    image = Image.open(source).convert("RGBA")
    width, height = image.size
    alpha = image.getchannel("A")
    # Native generation leaves alpha=1 haze outside the figures. It is ignored
    # for framing; all generated RGBA bytes within each crop remain unchanged.
    visible = alpha.point(lambda value: 255 if value >= 8 else 0)
    middle = width // 2
    assert visible.crop((middle - 8, 0, middle + 8, height)).getbbox() is None
    output = RUN / "candidate"
    output.mkdir(parents=True, exist_ok=True)
    views = []
    for name, x0, x1 in (("left-facing", 0, middle), ("right-facing", middle, width)):
        bounds = visible.crop((x0, 0, x1, height)).getbbox()
        assert bounds is not None, f"Missing {name} profile"
        left, top, right, bottom = bounds
        assert left > 8 and top > 8 and right < x1 - x0 - 8 and bottom < height - 8
        crop = (x0 + left - 8, top - 8, x0 + right + 8, bottom + 8)
        path = output / f"{name}.png"
        image.crop(crop).save(path)
        saved = Image.open(path).convert("RGBA")
        assert saved.tobytes() == image.crop(crop).tobytes()
        views.append({"name": name, "path": str(path.relative_to(ROOT)).replace("\\", "/"),
                      "source_crop": crop, "visible_height": bottom - top,
                      "size": saved.size, "sha256": digest(path)})
    heights = [view["visible_height"] for view in views]
    assert max(heights) / min(heights) < 1.01
    report = {"status": "candidate", "runtime_publish_allowed": False,
              "source": {"path": str(source.relative_to(ROOT)).replace("\\", "/"),
                         "sha256": digest(source), "size": image.size},
              "generator": "builtin-imagegen", "pillow": pillow_version,
              "postprocess": "Alpha>=8 framing only, exact RGBA crop with 8px margins; no resampling or painting",
              "views": views,
              "limitations": ["Only side material reference; no topology, grip or animation approval",
                              "Native alpha=1 background haze is retained in raw and excluded from framing",
                              "Texture projection must reject alpha<8 source pixels"]}
    (RUN / "qa").mkdir(exist_ok=True)
    (RUN / "qa/material-reference.json").write_bytes((json.dumps(report, indent=2) + "\n").encode("utf-8"))
    contract_path = RUN / "contract.json"
    contract = json.loads(contract_path.read_text(encoding="utf-8"))
    contract["status"] = "candidate"
    contract_path.write_bytes((json.dumps(contract, indent=2) + "\n").encode("utf-8"))
    print(json.dumps({"views": len(views), "source_sha256": report["source"]["sha256"],
                      "visible_heights": heights, "runtime_publish_allowed": False}))


if __name__ == "__main__":
    main()
