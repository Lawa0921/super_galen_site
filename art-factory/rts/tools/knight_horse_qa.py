"""Four-view silhouette gate for the reconstructed horse before rigging."""

import bpy
import hashlib
import json
import math
from pathlib import Path
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
RUN = ROOT / "runs" / "kingdom-knight" / "2026-10-05-v1"
OBJ = RUN / "candidate" / "guard-neural-uv.obj"  # Upstream historical basename.
TEXTURE = RUN / "candidate" / "guard-projected-albedo-2048.png"
OUT = RUN / "qa" / "horse-fourview"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def setup():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    # The neural OBJ already uses Z-up and a longitudinal Y axis. Blender's
    # OBJ default import axes would stand the horse on its nose.
    bpy.ops.wm.obj_import(filepath=str(OBJ), forward_axis="Y", up_axis="Z")
    horse = next(ob for ob in bpy.context.scene.objects if ob.type == "MESH")
    horse.name = "HorseNeuralUnrigged"
    horse.rotation_euler.z = math.pi
    horse.scale = (1.7, 3.0, 2.7)
    horse.location.z = 0.350668 * 2.7
    bpy.context.view_layer.update()
    material = bpy.data.materials.new("HorseProjectedAlbedo")
    material.use_nodes = True
    material.diffuse_color = (.35, .2, .1, 1)
    material.node_tree.nodes.get("Principled BSDF").inputs["Roughness"].default_value = .79
    image = bpy.data.images.load(str(TEXTURE))
    tex = material.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = image
    material.node_tree.links.new(tex.outputs["Color"], material.node_tree.nodes.get("Principled BSDF").inputs["Base Color"])
    horse.data.materials.clear()
    horse.data.materials.append(material)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 640
    scene.render.resolution_y = 640
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.world.color = (.24, .25, .27)
    for location, energy, size in [((3, 3, 5), 900, 4), ((-3, -2, 4), 700, 4)]:
        bpy.ops.object.light_add(type="AREA", location=location)
        bpy.context.object.data.energy = energy
        bpy.context.object.data.size = size
    bpy.ops.object.camera_add(location=(4, 4, 3))
    scene.camera = bpy.context.object
    scene.camera.data.type = "ORTHO"
    scene.camera.data.ortho_scale = 3.65
    return horse


def render_views(horse):
    OUT.mkdir(parents=True, exist_ok=True)
    cameras = {
        "right-side": (4.5, 0, 2.25),
        "left-side": (-4.5, 0, 2.25),
        "front-plus-y": (0, 4.5, 2.25),
        "rear-minus-y": (0, -4.5, 2.25),
    }
    cam = bpy.context.scene.camera
    for name, location in cameras.items():
        cam.location = location
        cam.rotation_euler = (Vector((0, 0, 1.05)) - cam.location).to_track_quat("-Z", "Y").to_euler()
        bpy.context.scene.render.filepath = str(OUT / f"horse-{name}.png")
        bpy.ops.render.render(write_still=True)
    points = [horse.matrix_world @ Vector(vertex) for vertex in horse.bound_box]
    return {
        "mesh_id": horse.name,
        "historical_upstream_filenames": [OBJ.name, TEXTURE.name],
        "uv_obj_sha256": sha(OBJ),
        "projected_albedo_sha256": sha(TEXTURE),
        "triangles": sum(len(poly.vertices) - 2 for poly in horse.data.polygons),
        "vertices_after_uv_split": len(horse.data.vertices),
        "bounds_min_blender_xyz_m": [round(min(point[i] for point in points), 4) for i in range(3)],
        "bounds_max_blender_xyz_m": [round(max(point[i] for point in points), 4) for i in range(3)],
        "front_assumption": "+Y after 180-degree Z rotation; verify with four renders",
        "runtime_publish_allowed": False,
    }


if __name__ == "__main__":
    horse = setup()
    report = render_views(horse)
    (RUN / "qa" / "horse-fourview.json").write_bytes(json.dumps(report, indent=2).encode("utf-8"))
    print(json.dumps(report, indent=2))
