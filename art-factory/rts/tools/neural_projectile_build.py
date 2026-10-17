"""Extract the original siege quarrel into two centered, static projectile assets."""
import hashlib
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector


TARGETS = {"bolt": 0.65, "heavy-bolt": 1.10}
MATERIALS = {
    "HewnOak": ("HewnOak", "hewn-oak", 0.0, 0.82),
    "ForgedIron": ("ForgedIron", "forged-iron", 0.72, 0.59),
    "TeamCloth": ("NeutralLinenFletching", "neutral-linen", 0.0, 0.89),
}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def capture_source(source):
    bpy.ops.wm.open_mainfile(filepath=str(source))
    pivot = bpy.data.objects["LoadedQuarrelPivot"]
    inv = pivot.matrix_world.inverted()
    parts = []
    for obj in pivot.children_recursive:
        if obj.type != "MESH":
            continue
        uv = obj.data.uv_layers.active
        assert uv is not None and len(obj.data.materials) == 1, obj.name
        parts.append({
            "name": obj.name,
            "material": obj.data.materials[0].name,
            "vertices": [tuple(inv @ obj.matrix_world @ vertex.co) for vertex in obj.data.vertices],
            "faces": [tuple(poly.vertices) for poly in obj.data.polygons],
            "uv": [[tuple(uv.data[loop].uv) for loop in poly.loop_indices] for poly in obj.data.polygons],
            "smooth": [poly.use_smooth for poly in obj.data.polygons],
        })
    points = [v for part in parts for v in part["vertices"]]
    low = [min(v[i] for v in points) for i in range(3)]
    high = [max(v[i] for v in points) for i in range(3)]
    center = [(low[i] + high[i]) / 2 for i in range(3)]
    assert len(parts) == 4 and set(p["material"] for p in parts) == set(MATERIALS)
    return parts, center, high[1] - low[1]


def make_material(name, stem, metallic, roughness, texture_dir):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.use_backface_culling = False
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    uv = mat.node_tree.nodes.new("ShaderNodeUVMap")
    uv.uv_map = "Architectural UV"
    image = bpy.data.images.load(str(texture_dir / f"{stem}-basecolor.jpg"), check_existing=True)
    image.pack()
    tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = image
    mat.node_tree.links.new(uv.outputs["UV"], tex.inputs["Vector"])
    mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


def add_camera(name, location, scale):
    bpy.ops.object.camera_add(location=location)
    camera = bpy.context.object
    camera.name = name
    camera.rotation_euler = (-camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = scale
    bpy.context.scene.camera = camera
    return camera


def render(path, location, scale, pixels):
    scene = bpy.context.scene
    camera = add_camera("QA_camera", location, scale)
    scene.render.resolution_x = scene.render.resolution_y = pixels
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(camera, do_unlink=True)


def build_variant(label, length, parts, center, source_length, texture_dir, run):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    # The source .blend packs larger textures under these same filenames.
    # Remove orphaned datablocks so check_existing cannot silently reuse them.
    for material in list(bpy.data.materials):
        bpy.data.materials.remove(material)
    for image in list(bpy.data.images):
        bpy.data.images.remove(image)
    mats = {key: make_material(*spec, texture_dir) for key, spec in MATERIALS.items()}
    scale = length / source_length
    meshes = []
    for part in parts:
        vertices = [tuple((v[i] - center[i]) * scale for i in range(3)) for v in part["vertices"]]
        mesh = bpy.data.meshes.new(part["name"] + "Mesh")
        mesh.from_pydata(vertices, [], part["faces"])
        mesh.update()
        uv = mesh.uv_layers.new(name="Architectural UV")
        for polygon, uv_face, smooth in zip(mesh.polygons, part["uv"], part["smooth"]):
            polygon.use_smooth = smooth
            for index, texcoord in zip(polygon.loop_indices, uv_face):
                uv.data[index].uv = texcoord
        obj = bpy.data.objects.new(part["name"], mesh)
        bpy.context.collection.objects.link(obj)
        mesh.materials.append(mats[part["material"]])
        meshes.append(obj)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = True
    scene.world.color = (0.20, 0.23, 0.28)
    bpy.ops.object.light_add(type="AREA", location=(1.3, 1.5, 2.0))
    bpy.context.object.data.energy = 260
    bpy.context.object.data.size = 2.0
    bpy.ops.object.light_add(type="AREA", location=(-1.1, -1.0, 1.3))
    bpy.context.object.data.energy = 180
    bpy.context.object.data.size = 2.0
    scene["source_siege_blend_sha256"] = sha(run / "raw" / "siege-lod0-source.blend")
    scene["forward_glb"] = "-Z"
    scene["projectile_length_m"] = length
    bpy.ops.wm.save_as_mainfile(filepath=str(run / "candidate" / f"{label}.blend"))
    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    glb = run / "candidate" / f"{label}.glb"
    bpy.ops.export_scene.gltf(filepath=str(glb), export_format="GLB", use_selection=True,
                              export_yup=True, export_apply=True, export_normals=True,
                              export_texcoords=True, export_materials="EXPORT", export_animations=False)
    qa = run / "qa"
    render(qa / f"{label}-front.png", (0, length * 3, length * .20), length * 1.6, 512)
    render(qa / f"{label}-side.png", (length * 3, 0, length * .30), length * 1.35, 512)
    render(qa / f"{label}-top.png", (length * .15, 0, length * 3), length * 1.35, 512)
    render(qa / f"{label}-64px.png", (length * 1.5, length * 2, length * 1.3), length * 1.35, 64)
    render(qa / f"{label}-32px.png", (length * 1.5, length * 2, length * 1.3), length * 1.35, 32)
    return {"label": label, "length_target_m": length, "source_geometry_parts": [p["name"] for p in parts],
            "triangles": sum(sum(len(face) - 2 for face in p["faces"]) for p in parts),
            "blend_sha256": sha(run / "candidate" / f"{label}.blend"), "glb_sha256": sha(glb), "glb_bytes": glb.stat().st_size}


def main():
    run = Path(sys.argv[sys.argv.index("--") + 1]).resolve()
    bpy.context.preferences.filepaths.save_version = 0
    source = run / "raw" / "siege-lod0-source.blend"
    parts, center, source_length = capture_source(source)
    result = {label: build_variant(label, length, parts, center, source_length, run / "candidate" / "textures", run) for label, length in TARGETS.items()}
    (run / "qa" / "build.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8", newline="\n")
    print("PROJECTILES_BUILT=" + json.dumps(result))


if __name__ == "__main__":
    main()
