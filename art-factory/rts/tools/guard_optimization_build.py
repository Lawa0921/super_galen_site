"""Join same-skin guard sword/shield material groups without changing art.

Reads the production-v1 Blender file from a supplied path and writes only a
new production-v2 run. Requires Blender 5.2 with --python-exit-code 1.
"""

from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import sys

import bpy


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def triangles(ob) -> int:
    return sum(len(face.vertices) - 2 for face in ob.data.polygons)


def material_triangles(objects) -> dict:
    result = Counter()
    for ob in objects:
        for face in ob.data.polygons:
            result[ob.data.materials[face.material_index].name] += len(face.vertices) - 2
    return dict(sorted(result.items()))


def validate_equipment(ob, rig) -> None:
    if ob.type != "MESH" or ob.parent != rig or ob.animation_data or ob.constraints or ob.data.shape_keys:
        raise AssertionError(f"Unsafe equipment object: {ob.name}")
    mods = [mod for mod in ob.modifiers if mod.type == "ARMATURE"]
    if len(mods) != 1 or mods[0].object != rig or not ob.vertex_groups or not ob.data.uv_layers:
        raise AssertionError(f"Skin or UV mismatch: {ob.name}")


def consolidate_material_slots(ob) -> None:
    original = list(ob.data.materials)
    unique = []
    indices = {}
    for index, material in enumerate(original):
        if material not in unique:
            unique.append(material)
        indices[index] = unique.index(material)
    face_materials = [indices[face.material_index] for face in ob.data.polygons]
    ob.data.materials.clear()
    for material in unique:
        ob.data.materials.append(material)
    for face, material_index in zip(ob.data.polygons, face_materials):
        face.material_index = material_index


def join_lod(lod: int, rig) -> tuple[object, dict]:
    suffix = f"LOD{lod}"
    sword = bpy.data.objects[f"KingdomSteelSword_{suffix}"]
    shield = bpy.data.objects[f"KingdomSunShield_{suffix}"]
    for ob in (sword, shield):
        validate_equipment(ob, rig)
    shared = {mat.name for mat in sword.data.materials} & {mat.name for mat in shield.data.materials}
    if shared != {"ForgedSteel", "WarmBrass", "WornLeather"}:
        raise AssertionError(f"Unexpected shared material groups: {shared}")
    before_triangles = triangles(sword) + triangles(shield)
    before_material = material_triangles((sword, shield))
    source_names = [sword.name, shield.name]
    bpy.ops.object.select_all(action="DESELECT")
    sword.select_set(True)
    shield.select_set(True)
    bpy.context.view_layer.objects.active = sword
    bpy.ops.object.join()
    combined = bpy.context.view_layer.objects.active
    combined.name = f"KingdomJoinedEquipment_{suffix}"
    consolidate_material_slots(combined)
    if triangles(combined) != before_triangles or material_triangles((combined,)) != before_material:
        raise AssertionError(f"Geometry changed while joining {suffix}: tris {before_triangles}->{triangles(combined)}, mats {before_material}->{material_triangles((combined,))}")
    if len(combined.data.materials) != 4:
        raise AssertionError(f"Expected four equipment materials, got {len(combined.data.materials)}")
    return combined, {"lod": lod, "rig": rig.name, "joined_from": source_names,
                      "joined_to": combined.name, "shared_materials": sorted(shared),
                      "triangles": before_triangles, "material_triangles": before_material}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-blend", type=Path, required=True)
    parser.add_argument("--output-run", type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1 :])
    source = args.source_blend.resolve()
    run = args.output_run.resolve()
    if not source.is_file() or run == source.parent or run.is_relative_to(source.parent):
        raise AssertionError("Source missing or output would overwrite production-v1")
    bpy.ops.wm.open_mainfile(filepath=str(source))
    rig = bpy.data.objects["GuardRig20"]
    if rig.type != "ARMATURE" or len(rig.data.bones) != 20:
        raise AssertionError("Expected original 20-bone rig")
    old = {lod: [bpy.data.objects[f"GuardBody_LOD{lod}"],
                 bpy.data.objects[f"KingdomSteelSword_LOD{lod}"],
                 bpy.data.objects[f"KingdomSunShield_LOD{lod}"]] for lod in (0, 1)}
    baseline = {lod: {"triangles": sum(triangles(ob) for ob in obs),
                      "by_material": material_triangles(obs)} for lod, obs in old.items()}
    joined = {}
    optimized = {}
    for lod in (0, 1):
        equipment, joined[lod] = join_lod(lod, rig)
        optimized[lod] = [bpy.data.objects[f"GuardBody_LOD{lod}"], equipment]
        if sum(triangles(ob) for ob in optimized[lod]) != baseline[lod]["triangles"]:
            raise AssertionError(f"LOD{lod} triangle count changed")
        if material_triangles(optimized[lod]) != baseline[lod]["by_material"]:
            raise AssertionError(f"LOD{lod} material triangles changed")
    bpy.ops.file.pack_all()
    blend = run / "raw" / "guard-production-v2.blend"
    blend.parent.mkdir(parents=True, exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    results = []
    for lod in (0, 1):
        for ob in optimized[0] + optimized[1]:
            ob.hide_render = ob not in optimized[lod]
        bpy.ops.object.select_all(action="DESELECT")
        for ob in [rig, *optimized[lod]]:
            ob.select_set(True)
        bpy.context.view_layer.objects.active = rig
        glb = run / "candidate" / f"guard-production-lod{lod}.glb"
        glb.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.export_scene.gltf(
            filepath=str(glb), export_format="GLB", use_selection=True,
            export_animations=True, export_animation_mode="ACTIONS",
            export_image_format="JPEG", export_jpeg_quality=90,
            export_skins=True, export_yup=True, export_def_bones=True,
        )
        results.append({"lod": lod, "source_blend": str(source), "source_blend_sha256": sha256(source),
                        "output_blend": str(blend), "output_blend_sha256": sha256(blend),
                        "output_glb": str(glb), "output_glb_sha256": sha256(glb),
                        "glb_bytes": glb.stat().st_size, "before": baseline[lod],
                        "after": {"triangles": sum(triangles(ob) for ob in optimized[lod]),
                                  "by_material": material_triangles(optimized[lod])},
                        "join": joined[lod], "runtime_publish_allowed": False})
    qa = run / "qa"
    qa.mkdir(parents=True, exist_ok=True)
    (qa / "build.json").write_text(json.dumps(results, indent=2) + "\n", encoding="utf-8")
    print(json.dumps([{"lod": row["lod"], "triangles": row["after"]["triangles"],
                       "bytes": row["glb_bytes"]} for row in results], indent=2), flush=True)


if __name__ == "__main__":
    main()
