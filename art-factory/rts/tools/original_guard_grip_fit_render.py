"""Render six inspectable fit views from the saved two-source candidate."""
from pathlib import Path
import hashlib
import json

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / "art-factory/rts/runs/original-guard-grip-fit/2026-10-05"


def main():
    report = json.loads((RUN / "qa/candidate.json").read_text(encoding="utf-8"))
    blend = RUN / "candidate/original-guard-grip-fit.blend"
    if hashlib.sha256(blend.read_bytes()).hexdigest() != report["sha256"]["blend"]:
        raise ValueError("Saved candidate changed")
    bpy.ops.wm.open_mainfile(filepath=str(blend))
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 900
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.world = bpy.data.worlds.new("Fit inspection world")
    scene.world.color = (.045, .055, .072)
    scene.view_settings.look = "AgX - Medium High Contrast"
    target = Vector((.45, .075, .9))
    for location, power, size in [((1.1, 1.1, 1.7), 150, .8), ((-.25, .85, .9), 85, .7),
                                  ((.8, -.9, 1.4), 100, .65)]:
        light_data = bpy.data.lights.new("Fit softbox", "AREA")
        light_data.energy = power
        light_data.size = size
        light = bpy.data.objects.new("Fit softbox", light_data)
        scene.collection.objects.link(light)
        light.location = location
        light.rotation_euler = (target - light.location).to_track_quat("-Z", "Y").to_euler()
    views = {
        "full-sword-proportion": ((1.6, 1.7, 1.0), (.45, .075, .58), 1.35),
        "four-finger-palm": ((.82, 1.25, .98), (.45, .075, .91), .33),
        "back-and-wrist": ((.12, -1.25, .99), (.45, .075, .91), .33),
        "guard-and-finger-contact": ((1.2, .65, .78), (.45, .075, .87), .29),
        "axis-from-pommel": ((.45, .075, 1.8), (.45, .075, .91), .28),
        "axis-from-guard": ((.45, .075, .18), (.45, .075, .91), .28),
    }
    directory = RUN / "qa/renders"
    directory.mkdir(parents=True, exist_ok=True)
    rendered = {}
    for name, (location, aim, scale) in views.items():
        camera_data = bpy.data.cameras.new(name)
        camera_data.type = "ORTHO"
        camera_data.ortho_scale = scale
        camera = bpy.data.objects.new(name, camera_data)
        scene.collection.objects.link(camera)
        camera.location = location
        camera.rotation_euler = (Vector(aim) - camera.location).to_track_quat("-Z", "Y").to_euler()
        scene.camera = camera
        image = directory / (name + ".png")
        scene.render.filepath = str(image)
        bpy.ops.render.render(write_still=True)
        rendered[name] = {"path": str(image.relative_to(ROOT)).replace("\\", "/"),
                          "sha256": hashlib.sha256(image.read_bytes()).hexdigest()}
        print("FIT_RENDER " + name, flush=True)
    result = {"status": "visual_review_pending", "runtime_publish_allowed": False,
              "candidate_sha256": report["sha256"], "renders": rendered, "candidate_resaved": False}
    (RUN / "qa/renders.json").write_bytes((json.dumps(result, indent=2) + "\n").encode("utf-8"))
    print("FIT_RENDERS " + json.dumps(result), flush=True)


if __name__ == "__main__":
    main()
