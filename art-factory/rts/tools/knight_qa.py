"""Mechanical candidate audit of mounted-knight glTF, source and previews."""

import hashlib
import json
import struct
from pathlib import Path
from PIL import Image, ImageChops


ROOT = Path(__file__).resolve().parents[1]
SOURCE_RUN = ROOT / "runs" / "kingdom-knight" / "2026-10-05-v1"
RUN = ROOT / "runs" / "kingdom-knight" / "2026-10-05-v2"
CONTRACT = json.loads((ROOT / "contracts" / "knight.json").read_text(encoding="utf-8"))
ROUNDTRIP = json.loads((RUN / "qa" / "roundtrip.json").read_text(encoding="utf-8"))
CLIPS = {"Idle", "Walk", "Attack", "Hurt", "Death"}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def glb_json(path):
    blob = path.read_bytes()
    assert blob[:4] == b"glTF" and struct.unpack_from("<I", blob, 8)[0] == len(blob)
    size, chunk_type = struct.unpack_from("<II", blob, 12)
    assert chunk_type == 0x4E4F534A
    return json.loads(blob[20 : 20 + size])


def tri_count(gltf):
    total = 0
    for mesh in gltf["meshes"]:
        for primitive in mesh["primitives"]:
            assert primitive.get("mode", 4) == 4
            total += gltf["accessors"][primitive["indices"]]["count"] // 3
    return total


def audit_lod(lod):
    file = RUN / "candidate" / f"knight-lod{lod}.glb"
    gltf = glb_json(file)
    imported = ROUNDTRIP[lod]
    names = {animation["name"] for animation in gltf["animations"]}
    node_names = [node.get("name", "") for node in gltf["nodes"]]
    channels = {
        animation["name"]: {
            (node_names[channel["target"]["node"]], channel["target"]["path"])
            for channel in animation["channels"]
        }
        for animation in gltf["animations"]
    }
    material_names = [material["name"] for material in gltf["materials"]]
    team_names = [name for name in material_names if "teamcloth" in name.lower()]
    mesh_primitives = [primitive for mesh in gltf["meshes"] for primitive in mesh["primitives"]]
    tris = tri_count(gltf)
    return {
        "path": str(file.relative_to(ROOT)),
        "sha256": sha(file),
        "bytes": file.stat().st_size,
        "triangles": tris,
        "meshes": len(gltf["meshes"]),
        "materials": material_names,
        "teamcloth_materials": team_names,
        "skins_bones": [len(skin["joints"]) for skin in gltf["skins"]],
        "animations": {name: len(channels[name]) for name in sorted(names)},
        "embedded_images": [
            {"mime": image["mimeType"], "bytes": gltf["bufferViews"][image["bufferView"]]["byteLength"]}
            for image in gltf["images"]
        ],
        "checks": {
            "exact_five_clips": names == CLIPS,
            "four_horse_legs_animated": all(
                (f"{region}_{side}_Upper", "rotation") in channels["Walk"]
                for region in ("Front", "Rear") for side in ("L", "R")
            ),
            "rider_arm_attack_animated": ("UpperArm_R", "rotation") in channels["Attack"],
            "teamcloth_saddle_shield_tabard": all(
                any(name.startswith(prefix) for name in team_names)
                for prefix in ("TeamCloth_Saddle", "TeamCloth_Shield", "TeamCloth_Tabard")
            ),
            "all_mesh_primitives_normal_uv_skinned": all(
                {"POSITION", "NORMAL", "TEXCOORD_0", "JOINTS_0", "WEIGHTS_0"} <= set(primitive["attributes"])
                for primitive in mesh_primitives
            ),
            "all_images_jpeg": all(image["mimeType"] == "image/jpeg" for image in gltf["images"]),
            "triangles_budget": tris < (20000 if lod == 0 else 10000),
            "roundtrip_triangles_match": tris == imported["triangles"],
            "roundtrip_ground_origin": abs(imported["idle_bounds_blender_xyz_m"][0][2]) < .01,
            "roundtrip_uv": imported["uv0_all_meshes"],
            "pbr_metallic_roughness": all("pbrMetallicRoughness" in material for material in gltf["materials"]),
        },
    }


def main():
    lods = [audit_lod(lod) for lod in (0, 1)]
    validator = json.loads((RUN / "qa" / "khronos-validator.json").read_text(encoding="utf-8"))
    raw = SOURCE_RUN / "raw" / "inputs"
    copies = {
        "horse-near-side": "horse-near-side.png",
        "horse-opposite-side": "horse-opposite-side.png",
        "guard-v3-blend": "guard-neural-v3.blend",
        "guard-v3-texture": "guard-projected-albedo-2048.png",
        "guard-production-blend": "guard-production-v1.blend",
        "guard-production-body-texture": "guard-body-1024-q90.jpg",
        "guard-production-teamcloth-texture": "guard-teamcloth-neutral-1024-q90.jpg",
    }
    source_checks = {ref["id"]: sha(raw / copies[ref["id"]]) == ref["sha256"] for ref in CONTRACT["source_refs"] if ref["id"] in copies}
    neutral_ref = next(ref for ref in CONTRACT["source_refs"] if ref["id"] == "neutral-saddle-weave")
    source_checks["neutral-saddle-weave"] = sha(SOURCE_RUN / "candidate" / "teamcloth-saddle-weave-1024-q90.jpg") == neutral_ref["sha256"]
    photos = RUN / "qa" / "roundtrip"
    blue = Image.open(photos / "knight-blue-640.png").convert("RGB")
    red = Image.open(photos / "knight-red-640.png").convert("RGB")
    walk_start = Image.open(photos / "knight-walk-01.png").convert("RGB")
    walk_end = Image.open(photos / "knight-walk-20.png").convert("RGB")
    team_bbox = ImageChops.difference(blue, red).getbbox()
    walk_bbox = ImageChops.difference(walk_start, walk_end).getbbox()
    baseline = json.loads((RUN / "qa" / "baseline-diagnostic.json").read_text(encoding="utf-8"))
    final = json.loads((RUN / "qa" / "final-diagnostic.json").read_text(encoding="utf-8"))
    final_lod1 = json.loads((RUN / "qa" / "final-lod1-diagnostic.json").read_text(encoding="utf-8"))
    bytes_total = sum(lod["bytes"] for lod in lods)
    report = {
        "status": "needs_review",
        "runtime_publish_allowed": False,
        "source_integrity": source_checks,
        "horse_reconstruction": {
            "obj_sha256": sha(SOURCE_RUN / "candidate" / "guard-neural-uv.obj"),
            "raw_projected_texture_sha256": sha(SOURCE_RUN / "candidate" / "guard-projected-albedo-2048.png"),
            "neural_method": "pinned TripoSR v2 geometry with v3 two-flank texture projection; provenance in inference-v2/projection-v3 JSON",
        },
        "lods": lods,
        "combined_glb_bytes": bytes_total,
        "combined_glb_bytes_goal": 4000000,
        "targeted_regression": {
            "front_lower_cross_cluster_faces_below_065m": {"v1_lod0": baseline["front_lower_cross_cluster_faces_below_065m"], "v2_lod0": final["front_lower_cross_cluster_faces_below_065m"], "v2_lod1": final_lod1["front_lower_cross_cluster_faces_below_065m"]},
            "before_walk_front_lower_stretch_max": max(row["stretch_max"] for row in baseline["walk"].values()),
            "after_walk_front_lower_stretch_max": max(row["stretch_max"] for row in final["walk"].values()),
            "before_walk_rear_lower_stretch_max": max(row["rear_stretch_max"] for row in baseline["walk"].values()),
            "after_walk_rear_lower_stretch_max": max(row["rear_stretch_max"] for row in final["walk"].values()),
            "before_death_lance_min_z_m": baseline["death48_bounds"]["lance"][0][2],
            "after_death_lance_min_z_m": final["death48_bounds"]["lance"][0][2],
            "before_death_shield_min_z_m": baseline["death48_bounds"]["shield"][0][2],
            "after_death_shield_min_z_m": final["death48_bounds"]["shield"][0][2],
            "lod0_checks": final["tests"],
            "lod1_checks": final_lod1["tests"],
        },
        "khronos_validator": [{"lod": row["lod"], "errors": row["issues"]["numErrors"], "warnings": row["issues"]["numWarnings"], "infos": row["issues"]["numInfos"]} for row in validator],
        "team_blue_red_pixel_difference_bbox": team_bbox,
        "walk_pose_pixel_difference_bbox": walk_bbox,
        "walk_front_leg_rotation_change_rad": ROUNDTRIP[0]["walk_front_leg_world_rotation_change_rad"],
        "attack_rider_arm_rotation_change_rad": ROUNDTRIP[0]["attack_rider_arm_world_rotation_change_rad"],
        "death_final_ground_z_m": ROUNDTRIP[0]["death_frame48_bounds_blender_xyz_m"][0][2],
        "preview_640_sha256": sha(RUN / "qa" / "knight-contact-640.png"),
        "preview_64_sha256": sha(RUN / "qa" / "knight-contact-64.png"),
        "walk_cycle_preview_sha256": sha(RUN / "qa" / "knight-walk-cycle.png"),
        "walk_cycle_64_preview_sha256": sha(RUN / "qa" / "knight-walk-cycle-64.png"),
        "before_after_preview_sha256": sha(RUN / "qa" / "knight-before-after.png"),
        "technical_checks_pass": all(source_checks.values()) and all(all(lod["checks"].values()) for lod in lods) and all(row["issues"]["numErrors"] == 0 for row in validator) and final["front_lower_cross_cluster_faces_below_065m"] == 0 and final_lod1["front_lower_cross_cluster_faces_below_065m"] == 0 and all(final["tests"].values()) and all(final_lod1["tests"].values()) and team_bbox is not None and walk_bbox is not None,
        "visual_risks": [
            "The visible Walk leg-sheet defect is removed in v2, but the reconstructed horse still has asymmetric neural lower-leg/hoof topology and should be reviewed in the final game camera.",
            "The combined LOD GLB size exceeds the 4 MB soft target; reducing texture or animation fidelity was not forced for this candidate.",
            "The saddlecloth is a tailored but visually simple neutral drape; check its material and silhouette in the final game camera.",
        ],
    }
    (RUN / "qa" / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"technical_checks_pass": report["technical_checks_pass"], "combined_glb_bytes": bytes_total, "lod_triangles": [lod["triangles"] for lod in lods]}, indent=2))
    if not report["technical_checks_pass"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
