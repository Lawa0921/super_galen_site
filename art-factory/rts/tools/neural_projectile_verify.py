"""Independent GLB JSON and Blender import checks for static projectile assets."""
import hashlib
import json
import struct
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from neural_projectile_build import add_camera


TARGETS = {"bolt": 0.65, "heavy-bolt": 1.10}


def glb_json(path):
    blob = path.read_bytes()
    assert blob[:4] == b"glTF"
    chunk_size = struct.unpack_from("<I", blob, 12)[0]
    return json.loads(blob[20:20 + chunk_size])


def verify_json(path, expected_length):
    data = glb_json(path)
    assert not data.get("animations") and not data.get("skins")
    assert len(data.get("materials", [])) == 3
    assert {mat["name"] for mat in data["materials"]} == {"HewnOak", "ForgedIron", "NeutralLinenFletching"}
    assert len(data.get("images", [])) == 3
    assert all(image["mimeType"] == "image/jpeg" for image in data["images"])
    for material in data["materials"]:
        pbr = material["pbrMetallicRoughness"]
        assert "baseColorTexture" in pbr
        assert "metallicFactor" in pbr and "roughnessFactor" in pbr
    primitives = [p for mesh in data["meshes"] for p in mesh["primitives"]]
    assert len(primitives) == 4
    assert all("TEXCOORD_0" in p["attributes"] and "NORMAL" in p["attributes"] for p in primitives)
    triangles = sum(data["accessors"][p["indices"]]["count"] // 3 for p in primitives)
    assert triangles == 52, triangles
    assert all("translation" not in node and "rotation" not in node and "scale" not in node for node in data["nodes"])
    spans = [(data["accessors"][p["attributes"]["POSITION"]]["min"], data["accessors"][p["attributes"]["POSITION"]]["max"]) for p in primitives]
    low_z, high_z = min(low[2] for low, _ in spans), max(high[2] for _, high in spans)
    assert abs((high_z - low_z) - expected_length) < .001 and abs((high_z + low_z) / 2) < .001
    point_mesh = next(mesh for mesh in data["meshes"] if "point" in mesh["name"].lower())
    feather_meshes = [mesh for mesh in data["meshes"] if "fletching" in mesh["name"].lower()]
    assert data["accessors"][point_mesh["primitives"][0]["attributes"]["POSITION"]]["min"][2] < -.49 * expected_length
    assert all(data["accessors"][mesh["primitives"][0]["attributes"]["POSITION"]]["max"][2] > .49 * expected_length for mesh in feather_meshes)
    assert path.stat().st_size < 250_000, path.stat().st_size
    return {"sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "bytes": path.stat().st_size,
            "triangles": triangles, "gltf_forward": "-Z", "gltf_bounds_z_m": [round(low_z, 6), round(high_z, 6)], "materials": [m["name"] for m in data["materials"]],
            "images": [{"mime_type": image["mimeType"], "encoded_bytes": data["bufferViews"][image["bufferView"]]["byteLength"]} for image in data["images"]]}


def import_and_render(path, label, expected_length, qa):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    assert len(objects) == 4
    points = [obj.matrix_world @ vertex.co for obj in objects for vertex in obj.data.vertices]
    low = [min(point[i] for point in points) for i in range(3)]
    high = [max(point[i] for point in points) for i in range(3)]
    center = [(low[i] + high[i]) / 2 for i in range(3)]
    length = high[1] - low[1]
    assert abs(length - expected_length) < 0.001, (label, length)
    assert max(abs(c) for c in center) < 0.001, (label, center)
    assert all(obj.location.length < 0.001 for obj in objects), [(obj.name, tuple(obj.location)) for obj in objects]
    assert high[1] > abs(high[0]) * 2 and low[1] < -abs(low[0]) * 2
    point = next(obj for obj in objects if "point" in obj.name.lower())
    feathers = [obj for obj in objects if "fletching" in obj.name.lower()]
    assert max((point.matrix_world @ vertex.co).y for vertex in point.data.vertices) > .49 * expected_length
    assert all(min((obj.matrix_world @ vertex.co).y for vertex in obj.data.vertices) < -.49 * expected_length for obj in feathers)
    sizes = {tuple(image.size) for image in bpy.data.images if image.source == "FILE"}
    assert sizes == {(512, 512)}, sizes
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = True
    scene.world = bpy.data.worlds.new("Roundtrip world")
    scene.world.color = (0.2, 0.23, 0.28)
    bpy.ops.object.light_add(type="AREA", location=(1.3, 1.5, 2.0))
    bpy.context.object.data.energy = 260
    bpy.context.object.data.size = 2.0
    bpy.ops.object.light_add(type="AREA", location=(-1.1, -1.0, 1.3))
    bpy.context.object.data.energy = 180
    bpy.context.object.data.size = 2.0
    camera = add_camera("Roundtrip camera", (expected_length * 3, 0, expected_length * .3), expected_length * 1.35)
    scene.render.resolution_x = scene.render.resolution_y = 512
    scene.render.filepath = str(qa / f"{label}-roundtrip-side.png")
    bpy.ops.render.render(write_still=True)
    return {"imported_meshes": [obj.name for obj in objects], "blender_bounds_xyz_m": [[round(x, 6) for x in low], [round(x, 6) for x in high]],
            "blender_center_xyz_m": [round(x, 6) for x in center], "blender_forward": "+Y", "glb_forward": "-Z", "length_m": round(length, 6),
            "imported_texture_sizes": sorted([list(size) for size in sizes]), "roundtrip_render": str(qa / f"{label}-roundtrip-side.png")}


def main():
    run = Path(sys.argv[sys.argv.index("--") + 1]).resolve()
    qa = run / "qa"
    report = {}
    for label, length in TARGETS.items():
        path = run / "candidate" / f"{label}.glb"
        report[label] = {"glb": verify_json(path, length), "roundtrip": import_and_render(path, label, length, qa)}
    (qa / "verify.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8", newline="\n")
    print("PROJECTILES_VERIFIED=" + json.dumps(report))


if __name__ == "__main__":
    main()
