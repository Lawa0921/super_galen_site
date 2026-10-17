import bpy, sys
from pathlib import Path
from mathutils import Vector

def look_at(obj, target):
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()

def select_clip(clip):
    for obj in bpy.context.scene.objects:
        if obj.animation_data:
            obj.animation_data.action = None
            for track in obj.animation_data.nla_tracks:
                track.mute = track.name != clip

def main():
    args = sys.argv[sys.argv.index("--") + 1:]
    glb, output, clip, frame, view = Path(args[0]).resolve(), Path(args[1]).resolve(), args[2], int(args[3]), args[4]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(glb))
    select_clip(clip)
    bpy.context.scene.frame_set(frame)
    bpy.context.view_layer.update()
    for obj in bpy.context.scene.objects:
        obj.hide_render = not (obj.type == "MESH" and (obj.name.startswith("NeuralWarhorse") or obj.name.startswith("LeatherRein")))
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1000
    scene.render.resolution_y = 700
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.world = bpy.data.worlds.new("Mouth closeup world")
    scene.world.color = (0.035, 0.045, 0.055)
    target = Vector((-0.12, 0.91, 1.43))
    if view == "side":
        location = target + Vector((3.35, 0.10, 0.14))
    else:
        location = target + Vector((2.45, -2.35, 0.48))
    bpy.ops.object.camera_add(location=location)
    camera = bpy.context.object
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 1.18
    look_at(camera, target)
    scene.camera = camera
    for location, energy, size in (
        (target + Vector((2.5, -2.5, 3.5)), 1000, 2.4),
        (target + Vector((-2.0, -1.0, 1.7)), 550, 2.0),
        (target + Vector((0.0, 2.0, 2.5)), 700, 2.0),
    ):
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.data.energy = energy
        light.data.size = size
        look_at(light, target)
    output.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(output)
    bpy.ops.render.render(write_still=True)

if __name__ == "__main__":
    main()

