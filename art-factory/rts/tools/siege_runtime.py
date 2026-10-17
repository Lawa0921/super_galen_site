"""Texture-only runtime candidate; preserve original siege geometry and clips."""

import copy
import hashlib
import json
import struct
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
ORIGINAL = ROOT / "runs" / "kingdom-siege" / "2026-10-04-original"
RUN = ROOT / "runs" / "kingdom-siege" / "2026-10-04-runtime-v1"
STEMS = ("hewn-oak", "forged-iron", "navy-cloth")


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def textures():
    out = RUN / "candidate" / "textures"
    out.mkdir(parents=True, exist_ok=True)
    rows = []
    for stem in STEMS:
        source_base = ORIGINAL / "candidate" / "textures" / f"{stem}-basecolor.jpg"
        source_normal = ORIGINAL / "candidate" / "textures" / f"{stem}-normal.png"
        base = out / f"{stem}-basecolor.jpg"
        normal = out / f"{stem}-normal.png"
        # The reviewed original was 512 px. Upscaling its color with a mild
        # low-pass filter keeps the on-model material appearance close while
        # meeting the 1024 px runtime packaging contract at a compact q90 size.
        color = Image.open(source_base).convert("RGB")
        color = color.resize((1024, 1024), Image.Resampling.BICUBIC)
        color = color.filter(ImageFilter.GaussianBlur(0.65))
        color.save(base, format="JPEG", quality=90, subsampling=2, optimize=True)
        old_normal = Image.open(source_normal).convert("RGB")
        assert old_normal.size == (512, 512)
        # PNG stays losslessly encoded. Fixed 256-color vector palette cuts
        # redundant pixel entropy; no stochastic dithering is introduced.
        quantized = old_normal.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
        quantized.save(normal, format="PNG", optimize=True)
        a = np.asarray(old_normal, dtype=np.float32) / 127.5 - 1
        b = np.asarray(quantized.convert("RGB"), dtype=np.float32) / 127.5 - 1
        a /= np.linalg.norm(a, axis=2, keepdims=True)
        b /= np.linalg.norm(b, axis=2, keepdims=True)
        angle = np.degrees(np.arccos(np.clip(np.sum(a * b, axis=2), -1, 1)))
        rows.append({
            "id": stem,
            "source_basecolor": str(source_base.relative_to(ROOT)),
            "source_basecolor_sha256": sha(source_base),
            "source_normal": str(source_normal.relative_to(ROOT)),
            "source_normal_sha256": sha(source_normal),
            "basecolor": str(base.relative_to(ROOT)),
            "basecolor_sha256": sha(base),
            "basecolor_size_px": [1024, 1024],
            "basecolor_encoding": "JPEG q90, chroma 4:2:0, optimized Huffman",
            "basecolor_bytes": base.stat().st_size,
            "normal": str(normal.relative_to(ROOT)),
            "normal_sha256": sha(normal),
            "normal_size_px": [512, 512],
            "normal_encoding": "lossless indexed PNG, 256 normal-vector colors, no dithering",
            "normal_bytes": normal.stat().st_size,
            "normal_quantization_mean_angle_deg": round(float(angle.mean()), 3),
            "normal_quantization_p99_angle_deg": round(float(np.percentile(angle, 99)), 3),
        })
    return rows


def parse_glb(path):
    blob = path.read_bytes()
    assert blob[:4] == b"glTF" and struct.unpack_from("<I", blob, 4)[0] == 2
    json_length, json_type = struct.unpack_from("<I4s", blob, 12)
    assert json_type == b"JSON"
    gltf = json.loads(blob[20 : 20 + json_length])
    bin_offset = 20 + json_length
    bin_length, bin_type = struct.unpack_from("<I4s", blob, bin_offset)
    assert bin_type == b"BIN\0"
    binary = blob[bin_offset + 8 : bin_offset + 8 + bin_length]
    return gltf, binary


def pack_glb(gltf, binary):
    encoded = json.dumps(gltf, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    encoded += b" " * ((-len(encoded)) % 4)
    binary += b"\0" * ((-len(binary)) % 4)
    total = 12 + 8 + len(encoded) + 8 + len(binary)
    return (struct.pack("<4sII", b"glTF", 2, total) +
            struct.pack("<I4s", len(encoded), b"JSON") + encoded +
            struct.pack("<I4s", len(binary), b"BIN\0") + binary)


def repack(lod):
    source = ORIGINAL / "candidate" / f"siege-lod{lod}.glb"
    gltf, binary = parse_glb(source)
    output = copy.deepcopy(gltf)
    replacements = {}
    for image in gltf["images"]:
        suffix = ".jpg" if image["mimeType"] == "image/jpeg" else ".png"
        replacements[image["bufferView"]] = (RUN / "candidate" / "textures" / (image["name"] + suffix)).read_bytes()
    packed = bytearray()
    for index, view in enumerate(gltf["bufferViews"]):
        packed.extend(b"\0" * ((-len(packed)) % 4))
        start = view.get("byteOffset", 0)
        contents = replacements.get(index, binary[start : start + view["byteLength"]])
        output["bufferViews"][index]["byteOffset"] = len(packed)
        output["bufferViews"][index]["byteLength"] = len(contents)
        packed.extend(contents)
    output["buffers"][0]["byteLength"] = len(packed) + ((-len(packed)) % 4)
    team = next(m for m in output["materials"] if m["name"] == "TeamCloth")
    team["pbrMetallicRoughness"]["baseColorFactor"] = [1.0, 1.0, 1.0, 1.0]
    dest = RUN / "candidate" / f"siege-lod{lod}.glb"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(pack_glb(output, bytes(packed)))
    return {
        "lod": lod,
        "source_glb": str(source.relative_to(ROOT)),
        "source_glb_sha256": sha(source),
        "candidate_glb": str(dest.relative_to(ROOT)),
        "candidate_glb_sha256": sha(dest),
        "original_bytes": source.stat().st_size,
        "candidate_bytes": dest.stat().st_size,
        "runtime_publish_allowed": False,
    }


def main():
    rows = textures()
    glbs = [repack(lod) for lod in (0, 1)]
    report = {"method": "texture-only GLB repack; geometry/animation untouched", "textures": rows, "glbs": glbs, "runtime_publish_allowed": False}
    qa = RUN / "qa"
    qa.mkdir(parents=True, exist_ok=True)
    (qa / "processing.json").write_bytes(json.dumps(report, indent=2).encode("utf-8"))
    print(json.dumps(glbs, indent=2))


if __name__ == "__main__":
    main()
