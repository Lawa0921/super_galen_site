"""Render v3 under exactly the v1 camera and light setup, then export GLB.

Usage: blender -b --python neural_blender_qa_v3.py -- UV.obj TEXTURE.png RUN_DIR
"""

import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from neural_blender_qa import add_area, render_view


def main():
    uv_obj, texture_file, run_dir = [Path(argument).resolve() for argument in sys.argv[sys.argv.index("--") + 1 :]]
    candidate, qa = run_dir / "candidate", run_dir / "qa"
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.wm.obj_import(filepath=str(uv_obj), forward_axis="Y", up_axis="Z")
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if len(meshes) != 1:
        raise RuntimeError(f"Expected one mesh, found {len(meshes)}")
    obj = meshes[0]
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shade_smooth()

    image = bpy.data.images.load(str(texture_file), check_existing=False)
    image.colorspace_settings.name = "sRGB"
    if tuple(image.size) != (2048, 2048):
        raise RuntimeError(f"Expected 2048 texture, got {tuple(image.size)}")
    material = bpy.data.materials.new("GuardProjectedV3Diffuse")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    principled = nodes.get("Principled BSDF")
    principled.inputs["Metallic"].default_value = 0.0
    principled.inputs["Roughness"].default_value = 0.5
    texture_node = nodes.new("ShaderNodeTexImage")
    texture_node.image = image
    material.node_tree.links.new(texture_node.outputs["Color"], principled.inputs["Base Color"])
    obj.data.materials.clear()
    obj.data.materials.append(material)

    scene = bpy.context.scene
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
    bpy.ops.wm.save_as_mainfile(filepath=str(candidate / "guard-neural-v3.blend"))
    bpy.ops.export_scene.gltf(filepath=str(candidate / "guard-neural-v3.glb"), export_format="GLB")
    report = {
        "mesh_count": len(meshes),
        "vertices_after_uv_split": len(obj.data.vertices),
        "triangles": sum(len(p.vertices) - 2 for p in obj.data.polygons),
        "smooth_faces": sum(p.use_smooth for p in obj.data.polygons),
        "uv_layers": [layer.name for layer in obj.data.uv_layers],
        "texture_size": list(image.size),
        "texture_color_space": image.colorspace_settings.name,
        "metallic": 0.0,
        "roughness": 0.5,
        "bounds": {"minimum": list(minimum), "maximum": list(maximum)},
        "cameras": renders,
        "lighting": "Identical key/fill/rim energies, positions, orthographic scale rule and AgX settings as neural_blender_qa.py v1",
    }
    (qa / "blender-qa-v3.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("PILOT_BLENDER_V3_QA=" + json.dumps(report))


if __name__ == "__main__":
    main()
