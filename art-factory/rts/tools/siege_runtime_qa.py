"""Independent checks for the texture-only siege runtime candidate."""

import hashlib
import json
import struct
import copy
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ORIGINAL = ROOT / "runs" / "kingdom-siege" / "2026-10-04-original"
RUN = ROOT / "runs" / "kingdom-siege" / "2026-10-04-runtime-v1"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read_glb(path):
    blob = path.read_bytes()
    assert blob[:4] == b"glTF"
    json_len, json_type = struct.unpack_from("<I4s", blob, 12)
    assert json_type == b"JSON"
    gltf = json.loads(blob[20 : 20 + json_len])
    bin_pos = 20 + json_len
    bin_len, bin_type = struct.unpack_from("<I4s", blob, bin_pos)
    assert bin_type == b"BIN\0"
    binary = blob[bin_pos + 8 : bin_pos + 8 + bin_len]
    return gltf, binary


def view_bytes(gltf, binary, index):
    view = gltf["bufferViews"][index]
    start = view.get("byteOffset", 0)
    return binary[start : start + view["byteLength"]]


def check_one(lod):
    before_path = ORIGINAL / "candidate" / f"siege-lod{lod}.glb"
    after_path = RUN / "candidate" / f"siege-lod{lod}.glb"
    before, before_bin = read_glb(before_path)
    after, after_bin = read_glb(after_path)
    names = [image["name"] for image in after["images"]]
    assert names == [image["name"] for image in before["images"]]
    image_views = {image["bufferView"] for image in before["images"]}
    geometry_equal = all(
        view_bytes(before, before_bin, index) == view_bytes(after, after_bin, index)
        for index in range(len(before["bufferViews"]))
        if index not in image_views
    )
    animation_equal = before["animations"] == after["animations"]
    structural_equal = all(before[key] == after[key] for key in ("accessors", "meshes", "nodes", "scenes", "scene", "skins") if key in before)
    before_normalized = copy.deepcopy(before)
    after_normalized = copy.deepcopy(after)
    for gltf in (before_normalized, after_normalized):
        gltf.pop("bufferViews")
        gltf.pop("buffers")
        for material in gltf["materials"]:
            if material["name"] == "TeamCloth":
                material["pbrMetallicRoughness"].pop("baseColorFactor")
    other_json_equal = before_normalized == after_normalized
    metadata_equal = before.get("asset", {}).get("extras") == after.get("asset", {}).get("extras")
    image_hashes = {}
    for image in after["images"]:
        ext = ".jpg" if image["mimeType"] == "image/jpeg" else ".png"
        file = RUN / "candidate" / "textures" / (image["name"] + ext)
        image_hashes[image["name"]] = sha(view_bytes(after, after_bin, image["bufferView"])) == sha(file.read_bytes())
    team = next(m for m in after["materials"] if m["name"] == "TeamCloth")
    team_factor = team["pbrMetallicRoughness"]["baseColorFactor"]
    assert team_factor == [1.0, 1.0, 1.0, 1.0]
    assert sorted(a["name"] for a in after["animations"]) == ["Attack", "Death", "Hurt", "Idle", "Walk"]
    before_roundtrip = json.loads((ORIGINAL / "qa" / "roundtrip.json").read_text(encoding="utf-8"))[lod]
    after_roundtrip = json.loads((RUN / "qa" / "roundtrip.json").read_text(encoding="utf-8"))[lod]
    roundtrip_equal = before_roundtrip == after_roundtrip
    report = {
        "lod": lod,
        "original_bytes": before_path.stat().st_size,
        "runtime_bytes": after_path.stat().st_size,
        "saved_bytes": before_path.stat().st_size - after_path.stat().st_size,
        "runtime_sha256": sha(after_path.read_bytes()),
        "geometry_buffers_byte_identical": geometry_equal,
        "animation_json_identical": animation_equal,
        "structural_json_identical": structural_equal,
        "all_other_gltf_json_identical": other_json_equal,
        "metadata_identical": metadata_equal,
        "roundtrip_identical": roundtrip_equal,
        "image_hashes_match": image_hashes,
        "team_factor_neutral": team_factor == [1.0, 1.0, 1.0, 1.0],
        "clips": [a["name"] for a in after["animations"]],
        "below_1_7m_decimal_bytes": after_path.stat().st_size < 1_700_000,
    }
    report["pass"] = all((geometry_equal, animation_equal, structural_equal, other_json_equal, metadata_equal, roundtrip_equal, all(image_hashes.values()), report["team_factor_neutral"]))
    return report


def main():
    texture_rows = []
    for stem in ("hewn-oak", "forged-iron", "navy-cloth"):
        base = RUN / "candidate" / "textures" / f"{stem}-basecolor.jpg"
        normal = RUN / "candidate" / "textures" / f"{stem}-normal.png"
        with Image.open(base) as image:
            assert image.format == "JPEG" and image.size == (1024, 1024)
            pixels = np.asarray(image.convert("RGB"), dtype=np.int16)
        with Image.open(normal) as image:
            assert image.format == "PNG" and image.size == (512, 512)
            normal_mode = image.mode
        channel_spread = float(np.abs(pixels[:, :, 0] - pixels[:, :, 1]).mean() + np.abs(pixels[:, :, 1] - pixels[:, :, 2]).mean())
        row = {"id": stem, "basecolor_sha256": sha(base.read_bytes()), "normal_sha256": sha(normal.read_bytes()), "basecolor_bytes": base.stat().st_size, "normal_bytes": normal.stat().st_size, "normal_png_mode": normal_mode, "channel_spread": round(channel_spread, 3)}
        if stem == "navy-cloth":
            row["neutral_cloth"] = channel_spread < 2.0
            assert row["neutral_cloth"]
        texture_rows.append(row)
    reports = [check_one(lod) for lod in (0, 1)]
    result = {"status": "pass" if all(r["pass"] for r in reports) else "fail", "textures": texture_rows, "lods": reports, "runtime_publish_allowed": False}
    output = RUN / "qa" / "structural.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(json.dumps(result, indent=2).encode("utf-8"))
    print(json.dumps(result, indent=2))
    assert result["status"] == "pass"


if __name__ == "__main__":
    main()
