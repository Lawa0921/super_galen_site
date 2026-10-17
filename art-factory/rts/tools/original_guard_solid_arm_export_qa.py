"""Independent GLB import smoke test for the diagnostic arm asset."""
import hashlib
import json
import struct
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / "art-factory/rts/runs/original-guard-solid-arm/2026-10-05"


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    before = sorted(obj.name for obj in bpy.data.objects)
    glb = RUN / "candidate/original-guard-solid-arm.glb"
    blend = RUN / "candidate/original-guard-solid-arm.blend"
    bpy.ops.wm.open_mainfile(filepath=str(blend))
    blend_objects = {obj.name: {"type": obj.type, "selected": obj.select_get()}
                     for obj in bpy.data.objects}
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(glb))
    with glb.open("rb") as stream:
        stream.read(12)
        json_length, _ = struct.unpack("<II", stream.read(8))
        gltf = json.loads(stream.read(json_length))
    actual_meshes = sorted(mesh["name"] for mesh in gltf["meshes"])
    meshes = sorted(obj.name for obj in bpy.data.objects if obj.type == "MESH")
    armatures = sorted(obj.name for obj in bpy.data.objects if obj.type == "ARMATURE")
    actions = sorted(action.name for action in bpy.data.actions)
    required = ["ElbowArmor", "FlexibleSleeve", "ForearmArmor", "UpperArmArmor"]
    report = {"status": "pass" if actual_meshes == required and len(armatures) == 1 and actions else "fail",
              "runtime_publish_allowed": False,
              "meshes": meshes, "armatures": armatures, "actions": actions,
              "glb_meshes": actual_meshes,
              "blender_import_helper": "Icosphere is created by Blender glTF armature import; raw GLB JSON contains exactly four requested meshes.",
              "objects_before_import": before,
              "blend_objects": blend_objects,
              "mesh_details": {obj.name: {"vertices": len(obj.data.vertices),
                                          "parent": obj.parent.name if obj.parent else None,
                                          "hide_render": bool(obj.hide_render)}
                               for obj in bpy.data.objects if obj.type == "MESH"},
              "sha256": {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in (glb, blend)}}
    path = RUN / "qa/export-import-report.json"
    path.write_bytes((json.dumps(report, indent=2) + "\n").encode("utf-8"))
    print("SOLID_ARM_EXPORT_QA", json.dumps(report), flush=True)
    if report["status"] != "pass":
        raise RuntimeError("GLB import validation failed")


if __name__ == "__main__":
    main()
