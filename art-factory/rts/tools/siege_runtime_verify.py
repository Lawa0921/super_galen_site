"""Blender import and team-tint visual checks for runtime siege GLBs."""

import bpy
import json
import sys
from pathlib import Path
from mathutils import Vector

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import siege_verify_import as verify


ROOT = Path(__file__).resolve().parents[1]
RUN = ROOT / "runs" / "kingdom-siege" / "2026-10-04-runtime-v1"
verify.RUN = RUN
verify.OUT = RUN / "qa" / "roundtrip"


def srgb_channel(value):
    value /= 255
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def team_preview():
    scene = bpy.context.scene
    material = bpy.data.materials.get("TeamCloth")
    assert material is not None
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    shader = nodes.get("Principled BSDF")
    image = next(node for node in nodes if node.type == "TEX_IMAGE" and node.image and "basecolor" in node.image.name)
    multiply = nodes.new("ShaderNodeMixRGB")
    multiply.blend_type = "MULTIPLY"
    multiply.inputs[0].default_value = 1
    links.new(image.outputs["Color"], multiply.inputs[1])
    links.new(multiply.outputs["Color"], shader.inputs["Base Color"])
    cam = scene.camera
    cam.location = (3.8, 5.7, 3.6)
    cam.rotation_euler = (Vector((0, 0, .91)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    verify.select_clip("Idle", 1)
    verify.OUT = RUN / "qa" / "teams"
    for label, hex_color in (("blue", "#28577d"), ("red", "#87382d")):
        rgb = bytes.fromhex(hex_color[1:])
        multiply.inputs[2].default_value = tuple(srgb_channel(channel) for channel in rgb) + (1,)
        verify.render(f"siege-{label}-640.png")
    verify.OUT = RUN / "qa" / "roundtrip"


def main():
    first = verify.inspect(0)
    team_preview()
    second = verify.inspect(1)
    original = [first, second]
    material = bpy.data.materials.get("TeamCloth")
    assert material is not None
    qa = RUN / "qa"
    qa.mkdir(parents=True, exist_ok=True)
    (qa / "roundtrip.json").write_bytes(json.dumps(original, indent=2).encode("utf-8"))
    print(json.dumps(original, indent=2), flush=True)


if __name__ == "__main__":
    main()
