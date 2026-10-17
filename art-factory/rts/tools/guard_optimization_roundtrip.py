"""Import both guard GLB versions and render identical animation frames."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys

import bpy
from mathutils import Vector


FRAMES = {
    "Idle": (0, 20, 40),
    "Walk": (0, 10, 20, 30, 40),
    "Attack": (0, 6, 13, 22, 40),
    "Hurt": (0, 6, 14, 28),
    "Death": (0, 10, 20, 36, 50),
}
RENDER_FRAMES = {("Idle", 0), ("Walk", 10), ("Walk", 20), ("Attack", 13),
                 ("Attack", 22), ("Hurt", 14), ("Death", 36), ("Death", 50)}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def clear_scene() -> None:
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)


def setup_render() -> None:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 640
    scene.render.resolution_y = 640
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.world.color = (.24, .25, .27)
    scene.view_settings.view_transform = "AgX"
    for location, energy, size in [((3, 3, 5), 850, 4), ((-3, -2, 4), 600, 4)]:
        bpy.ops.object.light_add(type="AREA", location=location)
        bpy.context.object.data.energy = energy
        bpy.context.object.data.size = size
    bpy.ops.object.camera_add(location=(3.9, 4.6, 2.75))
    camera = bpy.context.object
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 2.55
    camera.rotation_euler = (Vector((0, 0, .94)) - camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = camera


def color_component(value: int) -> float:
    value /= 255
    return value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4


def set_team_color(meshes, hex_color: str) -> list[str]:
    rgb = tuple(color_component(c) for c in bytes.fromhex(hex_color[1:]))
    materials = {mat for ob in meshes for mat in ob.data.materials if mat and "teamcloth" in mat.name.lower()}
    if len(materials) != 2:
        raise AssertionError(f"Expected body and shield TeamCloth, got {[mat.name for mat in materials]}")
    for mat in materials:
        bsdf = next(node for node in mat.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
        source = next((node for node in mat.node_tree.nodes if node.type == "TEX_IMAGE" and node.image), None)
        if source:
            mix = mat.node_tree.nodes.get("QA_TeamMultiply")
            if not mix:
                mix = mat.node_tree.nodes.new("ShaderNodeMixRGB")
                mix.name = "QA_TeamMultiply"
                mix.blend_type = "MULTIPLY"
                mix.inputs[0].default_value = 1
                mat.node_tree.links.new(source.outputs["Color"], mix.inputs[1])
                mat.node_tree.links.new(mix.outputs["Color"], bsdf.inputs["Base Color"])
            mix.inputs[2].default_value = (*rgb, 1)
        else:
            bsdf.inputs["Base Color"].default_value = (*rgb, 1)
    return sorted(mat.name for mat in materials)


def bounds(meshes) -> list[list[float]]:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    lows = [float("inf")] * 3
    highs = [float("-inf")] * 3
    for ob in meshes:
        evaluated = ob.evaluated_get(depsgraph)
        data = evaluated.to_mesh()
        for vertex in data.vertices:
            point = evaluated.matrix_world @ vertex.co
            for axis in range(3):
                lows[axis] = min(lows[axis], point[axis])
                highs[axis] = max(highs[axis], point[axis])
        evaluated.to_mesh_clear()
    return [[round(value, 5) for value in lows], [round(value, 5) for value in highs]]


def render(out: Path) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    bpy.context.scene.render.filepath = str(out)
    bpy.ops.render.render(write_still=True)


def inspect(glb: Path, out: Path, render_all: bool) -> dict:
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(glb))
    rigs = [ob for ob in bpy.context.scene.objects if ob.type == "ARMATURE"]
    meshes = [ob for ob in bpy.context.scene.objects if ob.type == "MESH" and
              any(mod.type == "ARMATURE" for mod in ob.modifiers)]
    if len(rigs) != 1 or len(rigs[0].data.bones) != 20:
        raise AssertionError("Roundtrip guard armature mismatch")
    if len(meshes) not in (2, 3):
        raise AssertionError("Roundtrip guard mesh count mismatch")
    rig = rigs[0]
    setup_render()
    poses = {}
    for clip, frames in FRAMES.items():
        action = bpy.data.actions.get(clip)
        if action is None:
            raise AssertionError(f"Roundtrip clip absent: {clip}")
        rig.animation_data.action = action
        clip_poses = {}
        for frame in frames:
            bpy.context.scene.frame_set(frame)
            bpy.context.view_layer.update()
            clip_poses[str(frame)] = bounds(meshes)
            if render_all and (clip, frame) in RENDER_FRAMES:
                render(out / f"{clip.lower()}-{frame:02d}.png")
        poses[clip] = clip_poses
    if render_all:
        rig.animation_data.action = bpy.data.actions["Idle"]
        bpy.context.scene.frame_set(0)
        set_team_color(meshes, "#28577d")
        render(out / "team-blue.png")
        set_team_color(meshes, "#87382d")
        render(out / "team-red.png")
    return {"glb": str(glb), "sha256": sha256(glb), "triangles": sum(
        len(face.vertices) - 2 for ob in meshes for face in ob.data.polygons),
        "mesh_objects": len(meshes), "bones": len(rig.data.bones),
        "clips": sorted(action.name for action in bpy.data.actions),
        "all_uv0": all(bool(ob.data.uv_layers) for ob in meshes),
        "poses": poses}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline-run", type=Path, required=True)
    parser.add_argument("--candidate-run", type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1 :])
    baseline = args.baseline_run.resolve()
    candidate = args.candidate_run.resolve()
    qa = candidate / "qa"
    qa.mkdir(parents=True, exist_ok=True)
    result = []
    for lod in (0, 1):
        old_path = baseline / "candidate" / f"guard-production-lod{lod}.glb"
        new_path = candidate / "candidate" / f"guard-production-lod{lod}.glb"
        old = inspect(old_path, qa / "roundtrip" / "v1" / f"lod{lod}", lod == 0)
        new = inspect(new_path, qa / "roundtrip" / "v2" / f"lod{lod}", lod == 0)
        if old["triangles"] != new["triangles"] or old["poses"] != new["poses"] or not new["all_uv0"]:
            raise AssertionError(f"LOD{lod} pose/bounds/UV changed")
        result.append({"lod": lod, "baseline": old, "candidate": new,
                       "bounds_all_keyframes_exact": True})
    (qa / "roundtrip.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps([{"lod": row["lod"], "triangles": row["candidate"]["triangles"],
                       "meshes_before": row["baseline"]["mesh_objects"],
                       "meshes_after": row["candidate"]["mesh_objects"]} for row in result], indent=2), flush=True)


if __name__ == "__main__":
    main()
