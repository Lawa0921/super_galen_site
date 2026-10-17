"""Make small texture derivatives from the original siege material art."""
import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build(source_run, run):
    out = run / "candidate" / "textures"
    out.mkdir(parents=True, exist_ok=True)
    sources = {
        "hewn-oak": source_run / "candidate" / "textures" / "hewn-oak-basecolor.jpg",
        "forged-iron": source_run / "candidate" / "textures" / "forged-iron-basecolor.jpg",
        "neutral-linen": source_run.parent / "2026-10-04-runtime-v1" / "candidate" / "textures" / "navy-cloth-basecolor.jpg",
    }
    report = {}
    for stem, source in sources.items():
        with Image.open(source) as image:
            rgb = image.convert("RGB").resize((512, 512), Image.Resampling.LANCZOS)
            target = out / f"{stem}-basecolor.jpg"
            rgb.save(target, format="JPEG", quality=78, subsampling=2, optimize=True)
        report[stem] = {"source": source.relative_to(source_run.parents[4]).as_posix(), "source_sha256": digest(source), "output": target.relative_to(run).as_posix(), "output_sha256": digest(target), "size": [512, 512], "bytes": target.stat().st_size}
    (run / "qa").mkdir(parents=True, exist_ok=True)
    (run / "qa" / "texture-derivatives.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8", newline="\n")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("source_run", type=Path)
    parser.add_argument("run", type=Path)
    args = parser.parse_args()
    print(json.dumps(build(args.source_run.resolve(), args.run.resolve())))
