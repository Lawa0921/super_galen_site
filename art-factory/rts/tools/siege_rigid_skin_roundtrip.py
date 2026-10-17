"""Blender GLB import, editable source, and paired v1/v3 pose renders."""

from __future__ import annotations

import bpy
import json
import sys
from pathlib import Path
from mathutils import Vector


def args_after_double_dash():
    if "--" not in sys.argv:
        raise AssertionError("Pass -- baseline-run candidate-run")
    return sys.argv[sys.argv.index("--") + 1:]


BASELINE, CANDIDATE = [Path(value).resolve() for value in args_after_double_dash()]
POSES = {"Idle": (1, 19), "Walk": (5, 17), "Attack": (10, 24),
         "Hurt": (4, 15), "Death": (10, 24)}
CLIPS = set(POSES)


def setup_scene():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 256
    scene.render.resolution_y = 256
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.world = bpy.data.worlds.new("Roundtrip World")
    scene.world.color = (.22, .24, .26)
    bpy.ops.object.camera_add(location=(3.8, 5.7, 3.6))
    camera = bpy.context.object
    camera.rotation_euler = (Vector((0, 0, .91)) - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 3.12
    scene.camera = camera
    for pos, power, size in [((3, 2, 5), 750, 3.4), ((-3, -2, 4), 520, 3.0)]:
        bpy.ops.object.light_add(type="AREA", location=pos)
        bpy.context.object.data.energy = power
        bpy.context.object.data.size = size


def select_clip(clip, frame, rest):
    for ob in bpy.data.objects:
        if not ob.animation_data:
            continue
        for track in ob.animation_data.nla_tracks:
            track.mute = True
        if ob.name in rest:
            loc, rot, scale = rest[ob.name]
            ob.location = loc
            ob.rotation_quaternion = rot
            ob.scale = scale
    bpy.context.scene.frame_set(0)
    bpy.context.view_layer.update()
    for ob in bpy.data.objects:
        if not ob.animation_data:
            continue
        for track in ob.animation_data.nla_tracks:
            if track.name == clip:
                track.mute = False
    bpy.context.scene.frame_set(frame)
    for ob in bpy.data.objects:
        if ob.animation_data:
            ob.update_tag(refresh={"OBJECT"})
    bpy.context.view_layer.update()


def tint(color):
    hex_color = "#28577d" if color == "blue" else "#87382d"
    rgb = bytes.fromhex(hex_color[1:])
    def srgb_to_linear(value):
        value /= 255
        return value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4
    rgba = tuple(srgb_to_linear(value) for value in rgb) + (1,)
    for material in bpy.data.materials:
        if "TeamCloth" not in material.name:
            continue
        material.diffuse_color = rgba
        if not material.use_nodes:
            continue
        nodes = material.node_tree.nodes
        links = material.node_tree.links
        shader = next(node for node in nodes if node.type == "BSDF_PRINCIPLED")
        multiply = nodes.get("QA Team Tint")
        if multiply is None:
            image = next(node for node in nodes if node.type == "TEX_IMAGE" and node.image and "basecolor" in node.image.name)
            multiply = nodes.new("ShaderNodeMixRGB")
            multiply.name = "QA Team Tint"
            multiply.blend_type = "MULTIPLY"
            multiply.inputs[0].default_value = 1
            links.new(image.outputs["Color"], multiply.inputs[1])
            links.new(multiply.outputs["Color"], shader.inputs["Base Color"])
        multiply.inputs[2].default_value = rgba


def clear_tint():
    for material in bpy.data.materials:
        if "TeamCloth" not in material.name or not material.use_nodes:
            continue
        nodes = material.node_tree.nodes
        multiply = nodes.get("QA Team Tint")
        if multiply is None:
            continue
        shader = next(node for node in nodes if node.type == "BSDF_PRINCIPLED")
        image = next(node for node in nodes if node.type == "TEX_IMAGE" and node.image and "basecolor" in node.image.name)
        material.node_tree.links.new(image.outputs["Color"], shader.inputs["Base Color"])
        nodes.remove(multiply)


def render(path, size):
    scene = bpy.context.scene
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def inspect(version, lod, run):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    glb = run / "candidate" / f"siege-lod{lod}.glb"
    bpy.ops.import_scene.gltf(filepath=str(glb))
    scene = bpy.context.scene
    meshes = [ob for ob in scene.objects if ob.type == "MESH"]
    # Blender's glTF importer creates a hidden 80-triangle Icosphere bone
    # display helper for skinned assets. It is absent from the GLB geometry.
    importer_helpers = [ob for ob in meshes if ob.name == "Icosphere"]
    model_meshes = [ob for ob in meshes if ob not in importer_helpers]
    triangle_count = sum(sum(len(poly.vertices) - 2 for poly in ob.data.polygons) for ob in model_meshes)
    clips = sorted({track.name for ob in scene.objects if ob.animation_data
                    for track in ob.animation_data.nla_tracks})
    if set(clips) != CLIPS:
        raise AssertionError(f"{version} LOD{lod} imported clips {clips}")
    rest = {}
    for ob in scene.objects:
        if ob.animation_data:
            for track in ob.animation_data.nla_tracks:
                track.mute = True
            rest[ob.name] = (ob.location.copy(), ob.rotation_quaternion.copy(), ob.scale.copy())
    scene.frame_set(0)
    bpy.context.view_layer.update()
    if version == "candidate":
        blend = CANDIDATE / "raw" / f"siege-lod{lod}.blend"
        blend.parent.mkdir(parents=True, exist_ok=True)
        if not blend.exists():
            bpy.ops.file.pack_all()
            bpy.ops.wm.save_as_mainfile(filepath=str(blend), compress=True)
    setup_scene()
    out = CANDIDATE / "qa" / "roundtrip" / version / f"lod{lod}"
    out.mkdir(parents=True, exist_ok=True)
    if lod == 0:
        select_clip("Idle", 1, rest)
        tint("blue")
        render(out / "team-blue-640.png", 640)
        tint("red")
        render(out / "team-red-640.png", 640)
        clear_tint()
    for clip, frames in POSES.items():
        for frame in frames:
            select_clip(clip, frame, rest)
            render(out / f"{clip.lower()}-{frame:02d}.png", 256)
    return {"version": version, "lod": lod, "glb": str(glb),
            "mesh_objects": len(model_meshes), "triangles": triangle_count,
            "blender_import_helper_objects": [ob.name for ob in importer_helpers],
            "mesh_triangles": {ob.name: sum(len(poly.vertices) - 2 for poly in ob.data.polygons) for ob in meshes},
            "clips": clips, "pose_renders": 10,
            "editable_blend": str(CANDIDATE / "raw" / f"siege-lod{lod}.blend") if version == "candidate" else None}


rows = [inspect(version, lod, run)
        for lod in (0, 1)
        for version, run in (("baseline", BASELINE), ("candidate", CANDIDATE))]
output = CANDIDATE / "qa" / "roundtrip-import.json"
output.write_text(json.dumps(rows, indent=2) + "\n", encoding="utf-8")
print(json.dumps(rows, indent=2), flush=True)
