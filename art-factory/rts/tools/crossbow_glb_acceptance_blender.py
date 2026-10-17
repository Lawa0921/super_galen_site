"""101-sample acceptance against the exported GLB, using Blender evaluation."""
from __future__ import annotations

import hashlib
import json
import os
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import kdtree

sys.path.insert(0, str(Path(__file__).resolve().parent))
from commander_assembly_collision import evaluated, exact_pairs

RUN = Path(os.environ.get("CROSSBOW_RUNTIME_RUN", "art-factory/rts/runs/all-models/2026-10-14-crossbow")).resolve()
CLIPS = tuple(filter(None, os.environ.get("CROSSBOW_CLIPS", "Attack,Death,Hurt,Idle,Walk").split(",")))
SAMPLES = int(os.environ.get("CROSSBOW_SAMPLES", "101"))
DEATH_SUPPORT_RELEASE_FRAME = float(os.environ.get("CROSSBOW_DEATH_SUPPORT_RELEASE_FRAME", "12.5"))


def set_action(rig, name: str) -> None:
    action = bpy.data.actions[name]
    rig.animation_data_create()
    rig.animation_data.action = action
    slots = getattr(action, "slots", None)
    if slots:
        try:
            rig.animation_data.action_slot = slots[0]
        except Exception:
            pass


def min_distance(points_a: np.ndarray, points_b: np.ndarray) -> tuple[float, int]:
    tree = kdtree.KDTree(len(points_b))
    for index, point in enumerate(points_b):
        tree.insert(tuple(float(value) for value in point), index)
    tree.balance()
    distances = [float(tree.find(tuple(float(value) for value in point))[2]) for point in points_a]
    values = np.asarray(distances)
    return float(values.min()), int((values <= 0.025).sum())


def main() -> None:
    rows=[];contacts=[];failures=[];assets=[];death_endpoints=[]
    for lod in (0, 1):
        path = RUN / "final" / "candidate" / f"crossbow{'-lod1' if lod else ''}.glb"
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=str(path))
        rig = next(obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE")
        body = bpy.data.objects[f"crossbowOriginalBody_LOD{lod}"]
        weapon = bpy.data.objects[f"ProceduralCrossbow_LOD{lod}"]
        hands = {side: bpy.data.objects[f"ProceduralGauntlet_{side}_LOD{lod}"] for side in "LR"}
        for clip in CLIPS:
            set_action(rig, clip)
            action = bpy.data.actions[clip]
            for frame in np.linspace(*action.frame_range, SAMPLES):
                bpy.context.scene.frame_set(int(frame), subframe=float(frame % 1));bpy.context.view_layer.update()
                bp,bf,bt=evaluated(body);wp,wf,wt=evaluated(weapon);hits=exact_pairs(bp[bf],wp[wf],bt.overlap(wt))
                row={"lod":lod,"clip":clip,"frame":float(frame),"crossings":int(len(hits)),"floor_m":float(wp[:,2].min())};rows.append(row)
                if len(hits): failures.append({**row,"type":"body_weapon_crossing"})
                for side,hand in hands.items():
                    hp,_,_=evaluated(hand);distance,near=min_distance(hp,wp);released=bool(clip=="Death" and side=="L" and frame>=DEATH_SUPPORT_RELEASE_FRAME)
                    contact={"lod":lod,"clip":clip,"frame":float(frame),"side":side,"min_distance_m":distance,"hand_points_within_25mm":near,"released_support":released};contacts.append(contact)
                    if (distance>0.025 or near<4) and not released: failures.append({**contact,"type":"hand_weapon_contact"})
                    if clip=="Death" and side=="L" and abs(frame-action.frame_range[1])<1e-5:
                        endpoint={"lod":lod,"support_release_distance_m":distance,"weapon_center_height_m":float(wp[:,2].mean())}
                        death_endpoints.append(endpoint)
                        if distance<0.10 or endpoint["weapon_center_height_m"]>0.45:
                            failures.append({**endpoint,"type":"death_still_holding_aim_pose"})
        assets.append({"lod":lod,"file":str(path),"sha256":hashlib.sha256(path.read_bytes()).hexdigest()})
    result={"status":"passed" if not failures else "failed","method":"Exported GLB imported into Blender; evaluated skinned triangles","samples_per_clip":SAMPLES,"assets":assets,"collision_checks":len(rows),"contact_checks":len(contacts),"max_strict_crossings":max(row["crossings"] for row in rows),"minimum_hand_weapon_distance_m":min(item["min_distance_m"] for item in contacts),"maximum_hand_weapon_distance_m":max(item["min_distance_m"] for item in contacts),"failures":failures[:200],"runtime_publish_allowed":False}
    result["death_endpoints"]=death_endpoints
    out=RUN/"qa/crossbow-glb-acceptance.json";out.write_text(json.dumps(result,indent=2)+"\n",encoding="utf-8");print(json.dumps({k:v for k,v in result.items() if k not in ("failures",)}))
    if failures: raise SystemExit(1)

if __name__ == "__main__": main()
