"""Blender batch texture bake, editable source export, and four view pilot QA.

Usage: blender -b --python neural_blender_qa.py -- INPUT.glb RUN_DIR
"""

import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


def add_area(name, location, energy, size, target):
    lamp = bpy.data.lights.new(name, "AREA")
    lamp.energy = energy
    lamp.shape = "DISK"
    lamp.size = size
    obj = bpy.data.objects.new(name, lamp)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def render_view(name, location, target, scale, width, height, path):
    camera = bpy.data.objects.get("PilotCamera")
    if camera is None:
        data = bpy.data.cameras.new("PilotCamera")
        camera = bpy.data.objects.new("PilotCamera", data)
        bpy.context.collection.objects.link(camera)
    camera.location = location
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = scale
    bpy.context.scene.camera = camera
    scene = bpy.context.scene
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    return str(path)


def main():
    arguments = sys.argv[sys.argv.index("--") + 1 :]
    source, run_dir = Path(arguments[0]).resolve(), Path(arguments[1]).resolve()
    candidate, qa = run_dir / "candidate", run_dir / "qa"
    candidate.mkdir(parents=True, exist_ok=True)
    qa.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(source))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if len(meshes) != 1:
        raise RuntimeError(f"Expected one mesh, found {len(meshes)}")
    obj = meshes[0]
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    # trimesh writes the source Z-up coordinates as glTF Y-up, while Blender's
    # importer applies a second axis conversion. Restore source Z-up here.
    obj.matrix_world = Matrix.Rotation(-math.pi / 2, 4, "X") @ obj.matrix_world
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)

    # The neural pilot stores vertex colors. Bake them into a portable 2k atlas.
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(island_margin=0.004)
    bpy.ops.object.mode_set(mode="OBJECT")
    texture = bpy.data.images.new("GuardNeuralAlbedo2048", width=2048, height=2048, alpha=True)
    texture.generated_color = (0.0, 0.0, 0.0, 0.0)
    material_nodes = []
    for material in obj.data.materials:
        material.use_nodes = True
        node = material.node_tree.nodes.new("ShaderNodeTexImage")
        node.name = "PilotBakeTarget"
        node.image = texture
        material.node_tree.nodes.active = node
        material_nodes.append((material, node))
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 8
    scene.render.bake.use_pass_direct = False
    scene.render.bake.use_pass_indirect = False
    scene.render.bake.use_pass_color = True
    scene.render.bake.margin = 8
    bpy.ops.object.bake(type="DIFFUSE")
    texture.filepath_raw = str(candidate / "guard-albedo-2048.png")
    texture.file_format = "PNG"
    texture.save()
    for material, node in material_nodes:
        principled = next((n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if principled:
            material.node_tree.links.new(node.outputs["Color"], principled.inputs["Base Color"])
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.world.color = (0.45, 0.45, 0.45)
    scene.view_settings.view_transform = "AgX"

    corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    minimum = Vector(tuple(min(point[i] for point in corners) for i in range(3)))
    maximum = Vector(tuple(max(point[i] for point in corners) for i in range(3)))
    center = (minimum + maximum) / 2
    height = maximum.z - minimum.z
    if height <= 0:
        raise RuntimeError("Mesh has no positive height")
    span = max(height, maximum.x - minimum.x, maximum.y - minimum.y)
    distance = span * 3.5
    add_area("Key", center + Vector((distance, -distance, distance)), 700, span * 3, center)
    add_area("Fill", center + Vector((-distance, distance, distance / 2)), 450, span * 3, center)
    add_area("Rim", center + Vector((-distance, -distance, distance)), 650, span * 2, center)
    scale = span * 1.18
    renders = {
        "front-positive-x": render_view("front", center + Vector((distance, 0, 0)), center, scale, 640, 800, qa / "front.png"),
        "side-positive-y": render_view("side", center + Vector((0, distance, 0)), center, scale, 640, 800, qa / "side.png"),
        "back-negative-x": render_view("back", center + Vector((-distance, 0, 0)), center, scale, 640, 800, qa / "back.png"),
        "game-64px": render_view("game-64px", center + Vector((distance, -distance, distance * 0.75)), center, scale * 1.15, 64, 64, qa / "game-64px.png"),
    }
    bpy.ops.wm.save_as_mainfile(filepath=str(candidate / "guard-textured.blend"))
    bpy.ops.export_scene.gltf(filepath=str(candidate / "guard-textured.glb"), export_format="GLB")
    report = {
        "objects": len(meshes),
        "vertices": len(obj.data.vertices),
        "triangles": sum(len(p.vertices) - 2 for p in obj.data.polygons),
        "materials": [material.name for material in obj.data.materials],
        "uv_layers": [layer.name for layer in obj.data.uv_layers],
        "vertex_colors": [layer.name for layer in obj.data.color_attributes],
        "texture_size": list(texture.size),
        "bounds": {"minimum": list(minimum), "maximum": list(maximum)},
        "camera_axis_labels": renders,
        "scale_note": "Native normalized TripoSR coordinates; no asserted meter scale",
    }
    (qa / "blender-qa.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("PILOT_BLENDER_QA=" + json.dumps(report))


if __name__ == "__main__":
    main()
