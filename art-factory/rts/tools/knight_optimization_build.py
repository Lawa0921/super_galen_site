"""Safely join same-rig, same-material knight equipment for fewer GLB draws.

Run with Blender 5.2 in background. Opens the immutable v2 editable files and
writes only a new v3 run. Both rigs, actions, art, textures and source remain.
"""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path

import bpy


GROUP_MATERIALS = {"AgedBrassTack", "DarkSaddleLeather", "TeamCloth_Saddle"}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def triangles(ob) -> int:
    return sum(len(poly.vertices) - 2 for poly in ob.data.polygons)


def inventory() -> dict:
    meshes = [ob for ob in bpy.data.objects if ob.type == "MESH"]
    by_material = Counter()
    for ob in meshes:
        material_names = [mat.name for mat in ob.data.materials if mat]
        if len(material_names) == 1:
            by_material[material_names[0]] += triangles(ob)
        else:
            for poly in ob.data.polygons:
                by_material[material_names[poly.material_index]] += len(poly.vertices) - 2
    return {
        "mesh_objects": len(meshes),
        "triangles": sum(triangles(ob) for ob in meshes),
        "triangles_by_material": dict(sorted(by_material.items())),
        "mesh_names": sorted(ob.name for ob in meshes),
    }


def compatible(ob, rig_name: str, material_name: str) -> None:
    if ob.type != "MESH" or not ob.parent or ob.parent.name != rig_name or ob.parent.type != "ARMATURE":
        raise AssertionError(f"Unsafe join parent for {ob.name}")
    if [mat.name for mat in ob.data.materials] != [material_name]:
        raise AssertionError(f"Mixed material join for {ob.name}")
    armatures = [mod for mod in ob.modifiers if mod.type == "ARMATURE"]
    if len(armatures) != 1 or armatures[0].object != ob.parent:
        raise AssertionError(f"Different skin for {ob.name}")
    if ob.animation_data or ob.constraints or ob.data.shape_keys:
        raise AssertionError(f"Independent animation or deformation on {ob.name}")
    if ob.data.uv_layers.active is None or not ob.vertex_groups:
        raise AssertionError(f"Missing UV or vertex groups on {ob.name}")


def join_safe_groups() -> list[dict]:
    grouped = defaultdict(list)
    for ob in list(bpy.data.objects):
        if ob.type != "MESH" or not ob.parent or ob.parent.type != "ARMATURE":
            continue
        mats = [mat.name for mat in ob.data.materials if mat]
        base_material = mats[0].removesuffix(".001") if len(mats) == 1 else ""
        if len(mats) == 1 and ob.parent.name == "WarhorseRig" and base_material in GROUP_MATERIALS:
            grouped[(ob.parent.name, mats[0])].append(ob)
    records = []
    for (rig_name, material_name), group in sorted(grouped.items()):
        if len(group) < 2:
            raise AssertionError(f"Expected repeated same-rig material: {rig_name}:{material_name}")
        for ob in group:
            compatible(ob, rig_name, material_name)
        names = sorted(ob.name for ob in group)
        pre_triangles = sum(triangles(ob) for ob in group)
        bpy.ops.object.select_all(action="DESELECT")
        for ob in group:
            ob.select_set(True)
        bpy.context.view_layer.objects.active = group[0]
        bpy.ops.object.join()
        merged = bpy.context.view_layer.objects.active
        if triangles(merged) != pre_triangles or len(merged.data.materials) != 1:
            raise AssertionError(f"Join geometry/material mismatch: {material_name}")
        if merged.parent.name != rig_name:
            raise AssertionError(f"Joined mesh lost rig: {material_name}")
        records.append({"rig": rig_name, "material": material_name, "joined_from": names,
                        "joined_to": merged.name, "triangles": pre_triangles,
                        "saved_mesh_nodes": len(group) - 1})
    if len(records) != 3 or sum(row["saved_mesh_nodes"] for row in records) != 5:
        raise AssertionError(f"Unexpected safe join plan: {records}")
    return records


def build_lod(lod: int, source_run: Path, output_run: Path) -> dict:
    source_blend = source_run / "raw" / f"knight-lod{lod}.blend"
    if not source_blend.is_file():
        raise FileNotFoundError(source_blend)
    bpy.ops.wm.open_mainfile(filepath=str(source_blend))
    baseline = inventory()
    if baseline["mesh_objects"] != 12:
        raise AssertionError("Unexpected v2 source mesh count")
    joined = join_safe_groups()
    result = inventory()
    if result["mesh_objects"] != 7 or result["triangles_by_material"] != baseline["triangles_by_material"]:
        raise AssertionError("Joined source changed material triangle totals")
    rigs = [ob for ob in bpy.data.objects if ob.type == "ARMATURE"]
    if len(rigs) != 2 or {ob.name for ob in rigs} != {"WarhorseRig", "MountedKnightRig"}:
        raise AssertionError("Expected the two original armatures")
    root = rigs[0].parent
    if root is None or rigs[1].parent != root:
        raise AssertionError("Unexpected root hierarchy")
    for rig in rigs:
        if not rig.animation_data:
            raise AssertionError("Rig lost NLA animation")
        for track in rig.animation_data.nla_tracks:
            track.mute = False
        rig.animation_data.action = None
    output_blend = output_run / "raw" / f"knight-lod{lod}.blend"
    output_blend.parent.mkdir(parents=True, exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(output_blend))
    meshes = [ob for ob in bpy.data.objects if ob.type == "MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    for ob in [root, *rigs, *meshes]:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = root
    glb = output_run / "candidate" / f"knight-lod{lod}.glb"
    glb.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(glb), export_format="GLB", use_selection=True,
        export_yup=True, export_normals=True, export_texcoords=True,
        export_materials="EXPORT", export_extras=True, export_skins=True,
        export_def_bones=True, export_animations=True,
        export_animation_mode="NLA_TRACKS", export_nla_strips=True,
        export_anim_slide_to_zero=True, export_image_format="JPEG",
        export_jpeg_quality=90,
    )
    return {
        "lod": lod,
        "source_blend": str(source_blend), "source_blend_sha256": sha256(source_blend),
        "output_blend": str(output_blend), "output_blend_sha256": sha256(output_blend),
        "output_glb": str(glb), "output_glb_sha256": sha256(glb),
        "source_inventory": baseline, "output_inventory": result,
        "joins": joined, "glb_bytes": glb.stat().st_size,
        "runtime_publish_allowed": False,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-run", type=Path, required=True)
    parser.add_argument("--output-run", type=Path, required=True)
    args = parser.parse_args(__import__("sys").argv[__import__("sys").argv.index("--") + 1 :])
    source_run = args.source_run.resolve()
    output_run = args.output_run.resolve()
    if source_run == output_run or output_run.is_relative_to(source_run):
        raise AssertionError("Never overwrite v2 source")
    rows = [build_lod(lod, source_run, output_run) for lod in (0, 1)]
    qa = output_run / "qa"
    qa.mkdir(parents=True, exist_ok=True)
    (qa / "build.json").write_text(json.dumps(rows, indent=2) + "\n", encoding="utf-8")
    print(json.dumps([{"lod": row["lod"], "mesh_before": row["source_inventory"]["mesh_objects"],
                       "mesh_after": row["output_inventory"]["mesh_objects"],
                       "bytes": row["glb_bytes"]} for row in rows], indent=2), flush=True)


if __name__ == "__main__":
    main()
