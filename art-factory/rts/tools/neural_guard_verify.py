"""Read delivered guard GLBs, verifying skins, clips, JPEGs, and material split."""

import json
import struct
import sys
from pathlib import Path

from PIL import Image
from io import BytesIO

from neural_pilot import sha256


def read_glb(path):
    content = path.read_bytes()
    if content[:4] != b"glTF":
        raise ValueError(f"Not a GLB: {path}")
    length, kind = struct.unpack_from("<I4s", content, 12)
    if kind != b"JSON":
        raise ValueError("Missing GLB JSON chunk")
    data = json.loads(content[20 : 20 + length])
    binary_start = 20 + length + 8
    return data, content[binary_start:]


def verify(path):
    data, binary = read_glb(path)
    images = []
    for item in data.get("images", []):
        view = data["bufferViews"][item["bufferView"]]
        image_bytes = binary[view.get("byteOffset", 0) : view.get("byteOffset", 0) + view["byteLength"]]
        with Image.open(BytesIO(image_bytes)) as image:
            images.append({"mime_type": item.get("mimeType"), "size": list(image.size), "encoded_bytes": len(image_bytes)})
    materials = []
    for item in data.get("materials", []):
        pbr = item.get("pbrMetallicRoughness", {})
        materials.append({"name": item.get("name"), "factor": pbr.get("baseColorFactor", [1, 1, 1, 1]), "has_texture": "baseColorTexture" in pbr})
    animations = [{"name": item.get("name"), "channels": len(item.get("channels", [])), "samplers": len(item.get("samplers", []))} for item in data.get("animations", [])]
    primitives = [primitive for mesh in data.get("meshes", []) for primitive in mesh.get("primitives", [])]
    triangles = sum(data["accessors"][primitive["indices"]]["count"] // 3 for primitive in primitives)
    weighted = all("JOINTS_0" in primitive.get("attributes", {}) and "WEIGHTS_0" in primitive.get("attributes", {}) for primitive in primitives)
    bone_names = [data["nodes"][index]["name"] for skin in data.get("skins", []) for index in skin["joints"]]
    result = {"path": str(path), "sha256": sha256(path), "bytes": path.stat().st_size, "triangles": triangles, "skins": len(data.get("skins", [])), "joint_names": bone_names, "all_primitives_skinned": weighted, "animations": animations, "images": images, "materials": materials}
    # ModelInstance performs exact, case-sensitive clip lookup at runtime.
    expected = {"Idle", "Walk", "Attack", "Hurt", "Death"}
    if len(data.get("skins", [])) != 1 or len(set(bone_names)) != 20 or not weighted:
        raise RuntimeError(f"Skin contract failed: {result}")
    if len(animations) != len(expected) or {item["name"] for item in animations} != expected or any(item["channels"] < 2 for item in animations):
        raise RuntimeError(f"Five exported clips missing or static: {result}")
    if not images or any(item["mime_type"] != "image/jpeg" or item["size"] != [1024, 1024] for item in images):
        raise RuntimeError(f"Runtime JPEG texture contract failed: {result}")
    cloth = [item for item in materials if item["name"] == "TeamCloth"]
    shield = [item for item in materials if item["name"] == "TeamCloth_Shield"]
    armor = [item for item in materials if item["name"].startswith("GuardArmor")]
    if len(cloth) != 1 or len(shield) != 1 or len(armor) != 1 or not cloth[0]["has_texture"] or not armor[0]["has_texture"]:
        raise RuntimeError(f"Separate body/shield TeamCloth materials missing: {result}")
    if shield[0]["has_texture"] or shield[0]["factor"][:3] != [1, 1, 1]:
        raise RuntimeError(f"Shield runtime tint material is not neutral white: {result}")
    if cloth[0]["factor"][2] <= cloth[0]["factor"][0] * 2 or armor[0]["factor"][:3] != [1, 1, 1]:
        raise RuntimeError(f"Team color factor affected armor: {result}")
    return result


def main():
    run_dir = Path(sys.argv[1])
    result = {}
    for label in ("lod0", "lod1"):
        result[label] = verify(run_dir / "candidate" / f"guard-production-{label}.glb")
    (run_dir / "qa" / "glb-mechanical-verify.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8", newline="\n")
    print("GUARD_GLB_VERIFIED=" + json.dumps(result))


if __name__ == "__main__":
    main()
