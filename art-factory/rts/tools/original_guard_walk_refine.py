"""Original Walk-only 3D planted-foot refinement.

Call refine_walk after original parts/cloth baking, before bounds and export.
No source geometry, Root/Pelvis, other Walk bones, or other clips are changed.
Dense subframe keys require the exporter to retain them (force sampling False).
"""
import hashlib
import json
import math
from pathlib import Path
import sys
import bpy
from mathutils import Matrix, Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from original_guard_walk_refine_math import solve_two_link, transition_correction, smootherstep

PARTS=("Thigh","Shin","Foot")
SIDES=("L","R")
LEGS=tuple(f"{part}_{side}" for side in SIDES for part in PARTS)

def action_fcurves(action):
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                yield from bag.fcurves

def protected_signature():
    rows={}
    for action in bpy.data.actions:
        for fc in action_fcurves(action):
            allowed=action.name=="Walk" and any(fc.data_path==f'pose.bones["{name}"].{prop}' for name in LEGS for prop in ("location","rotation_quaternion"))
            if not allowed:
                rows[f"{action.name}|{fc.data_path}|{fc.array_index}"]=[
                    [list(k.co),list(k.handle_left),list(k.handle_right),k.interpolation,k.handle_left_type,k.handle_right_type]
                    for k in fc.keyframe_points]
    return hashlib.sha256(json.dumps(rows,sort_keys=True).encode()).hexdigest()

def refine_walk(armature, body_objects, fps=30, sample_hz=120, transition_s=2/30, sole_clearance_m=.001):
    """Lock each 0.2s stance in 3D; preserve original swing except C1 joins/floor."""
    scene=bpy.context.scene
    if sample_hz<120 or sample_hz%fps or fps!=30:
        raise ValueError("This source contract uses 30fps and at least 120Hz integral subframe sampling")
    if max(abs(armature.matrix_world[i][j]-(1 if i==j else 0)) for i in range(4) for j in range(4))>1e-5:
        raise ValueError("Expected the project rig in identity armature/world coordinates")
    action=bpy.data.actions.get("Walk")
    if action is None:raise ValueError("Original Walk action is missing")
    duration=2/3;stance=.2;speed=3.0
    if not 0<transition_s<(duration-stance)/2:raise ValueError("Invalid swing transition duration")
    if not 0<=sole_clearance_m<=.003:raise ValueError("Sole clearance must stay within 3mm")
    previous_action=armature.animation_data.action
    previous_frame=float(scene.frame_current)+float(scene.frame_subframe)
    protected_before=protected_signature()
    armature.animation_data.action=action
    def evaluate(time):
        local=time%duration
        if min(local,duration-local)<1e-9:local=0
        frame=local*fps;scene.frame_set(math.floor(frame),subframe=frame-math.floor(frame));bpy.context.view_layer.update()
        return {name:{"matrix":armature.pose.bones[name].matrix.copy(),
                      "location":armature.pose.bones[name].location.copy(),
                      "scale":armature.pose.bones[name].scale.copy()} for name in LEGS}
    links={}
    for side in SIDES:
        thigh,shin,foot=(armature.data.bones[f"{p}_{side}"] for p in PARTS)
        if (thigh.tail_local-shin.head_local).length>1e-5 or (shin.tail_local-foot.head_local).length>1e-5:
            raise ValueError("Source joint centers do not meet; refusing to change leg lengths")
        links[side]=(float(thigh.length),float(shin.length))
    # Rigid bottom vertices are taken from the actual supplied boot geometry,
    # independently of whether its source toe faced forward or backward.
    soles={}
    for side in SIDES:
        name=f"Foot_{side}";points=[]
        for obj in body_objects:
            group=obj.vertex_groups.get(name)
            if group is None:continue
            to_arm=armature.matrix_world.inverted()@obj.matrix_world
            for vertex in obj.data.vertices:
                weight=sum(g.weight for g in vertex.groups if g.group==group.index)
                if weight>=.999:points.append(to_arm@vertex.co)
        if not points:raise ValueError(f"No rigid Foot_{side} vertices in supplied geometry")
        bottom=min(p.z for p in points)
        points=[p for p in points if p.z<=bottom+.03]
        if len(points)<4:raise ValueError("Insufficient actual sole vertices")
        inv=armature.data.bones[name].matrix_local.inverted()
        soles[side]=[inv@p for p in points]
    anchors={};boundaries={}
    for side in SIDES:
        base=0 if side=="L" else duration/2
        start=evaluate(base)[f"Foot_{side}"]["matrix"]
        anchor_p=start.translation.copy();anchor_q=start.to_quaternion()
        anchor_q.normalize()
        minimum=min((Matrix.LocRotScale(anchor_p,anchor_q,Vector((1,1,1)))@p).z for p in soles[side])
        anchor_p.z+=sole_clearance_m-minimum
        anchors[side]=(anchor_p,anchor_q)
        eps=1e-4
        orig_start=evaluate(base+stance)[f"Foot_{side}"]["matrix"].translation.copy()
        orig_after=evaluate(base+stance+eps)[f"Foot_{side}"]["matrix"].translation.copy()
        orig_end=evaluate(base+duration)[f"Foot_{side}"]["matrix"].translation.copy()
        orig_before=evaluate(base+duration-eps)[f"Foot_{side}"]["matrix"].translation.copy()
        stance_end=anchor_p-Vector((0,speed*stance,0));desired_v=Vector((0,-speed,0))
        boundaries[side]={"start_delta":stance_end-orig_start,"start_velocity_delta":desired_v-(orig_after-orig_start)/eps,
                          "end_delta":anchor_p-orig_end,"end_velocity_delta":desired_v-(orig_end-orig_before)/eps}
    count=round(duration*sample_hz)+1
    source_states=[evaluate(i/sample_hz) for i in range(count)]
    plans=[];minimum_margin=math.inf;minimum_pole=math.inf;maximum_floor_adjust=0
    for i,source in enumerate(source_states):
        time=i/sample_hz;plan={}
        for side in SIDES:
            s=(time+(duration/2 if side=="R" else 0))%duration
            if min(s,duration-s)<1e-8:s=0
            anchor_p,anchor_q=anchors[side]
            original=source[f"Foot_{side}"]["matrix"]
            p=original.translation.copy();q=original.to_quaternion();q.normalize()
            b=boundaries[side]
            if s<=stance+1e-9:
                p=anchor_p-Vector((0,speed*s,0));q=anchor_q.copy()
            elif s<stance+transition_s:
                elapsed=s-stance
                p+=Vector(transition_correction(b["start_delta"],b["start_velocity_delta"],elapsed,transition_s))
                q=anchor_q.slerp(q,smootherstep(elapsed/transition_s))
            elif s>duration-transition_s:
                remaining=duration-s
                p+=Vector(transition_correction(b["end_delta"],-b["end_velocity_delta"],remaining,transition_s))
                q=anchor_q.slerp(q,smootherstep(remaining/transition_s))
            fm=Matrix.LocRotScale(p,q,Vector((1,1,1)))
            minimum=min((fm@v).z for v in soles[side])
            correction=max(0.0,sole_clearance_m-minimum)
            p.z+=correction;maximum_floor_adjust=max(maximum_floor_adjust,correction)
            hip=source[f"Thigh_{side}"]["matrix"].translation
            old_knee=source[f"Shin_{side}"]["matrix"].translation
            solved=solve_two_link(hip,p,old_knee,*links[side])
            minimum_margin=min(minimum_margin,solved["reach_margin"]);minimum_pole=min(minimum_pole,solved["source_pole_offset"])
            knee=Vector(solved["knee"])
            for part,head,tail in (("Thigh",hip,knee),("Shin",knee,p)):
                old=source[f"{part}_{side}"]["matrix"]
                old_axis=old.to_3x3().col[1].normalized();new_axis=(tail-head).normalized()
                rotation=old_axis.rotation_difference(new_axis)@old.to_quaternion();rotation.normalize()
                plan[f"{part}_{side}"]=Matrix.LocRotScale(head,rotation,Vector((1,1,1)))
            plan[f"Foot_{side}"]=Matrix.LocRotScale(p,q,Vector((1,1,1)))
        plans.append(plan)
    # No animation mutation occurs until every target has passed reachability.
    changed_paths={f'pose.bones["{name}"].{prop}' for name in LEGS for prop in ("location","rotation_quaternion")}
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for fc in list(bag.fcurves):
                    if fc.data_path in changed_paths:bag.fcurves.remove(fc)
    max_target_error=max_length_error=max_local_translation=0.0
    last_quaternions={}
    for i,(plan,original) in enumerate(zip(plans,source_states)):
        frame=i*fps/sample_hz;scene.frame_set(math.floor(frame),subframe=frame-math.floor(frame))
        for side in SIDES:
            for part in PARTS:
                name=f"{part}_{side}";pose=armature.pose.bones[name]
                pose.rotation_mode="QUATERNION";pose.matrix=plan[name]
                pose.scale=original[name]["scale"]
                if name in last_quaternions and pose.rotation_quaternion.dot(last_quaternions[name])<0:
                    pose.rotation_quaternion.negate()
                last_quaternions[name]=pose.rotation_quaternion.copy()
                bpy.context.view_layer.update()
                max_local_translation=max(max_local_translation,(pose.location-original[name]["location"]).length)
                pose.keyframe_insert(data_path="location",frame=frame,group=name)
                pose.keyframe_insert(data_path="rotation_quaternion",frame=frame,group=name)
            thigh,shin,foot=(armature.pose.bones[f"{p}_{side}"] for p in PARTS)
            max_target_error=max(max_target_error,(foot.head-plan[f"Foot_{side}"].translation).length)
            max_length_error=max(max_length_error,abs((shin.head-thigh.head).length-links[side][0]),abs((foot.head-shin.head).length-links[side][1]))
    for fc in action_fcurves(action):
        if fc.data_path in changed_paths:
            for key in fc.keyframe_points:key.interpolation="LINEAR"
    protected_after=protected_signature()
    if protected_after!=protected_before:raise AssertionError("Protected action data changed")
    armature.animation_data.action=previous_action
    scene.frame_set(math.floor(previous_frame),subframe=previous_frame-math.floor(previous_frame));bpy.context.view_layer.update()
    return {"status":"candidate_requires_export_and_visual_review","runtime_publish_allowed":False,
            "scope":"Walk Thigh/Shin/Foot only; original hip/root sway, other bones and four other clips preserved",
            "continuous_translation_baseline_mps":speed,"runtime_20hz_stepping_included":False,
            "sample_hz":sample_hz,"frame_count":count,"frame_step":fps/sample_hz,
            "stance_seconds":stance,"cycle_seconds":duration,"transition_seconds":transition_s,"sole_clearance_m":sole_clearance_m,
            "sole_vertex_counts":{s:len(v) for s,v in soles.items()},"true_link_lengths_m":links,
            "min_reach_margin_m":minimum_margin,"min_source_knee_pole_offset_m":minimum_pole,
            "maximum_swing_floor_adjustment_m":maximum_floor_adjust,
            "max_ankle_target_error_m":max_target_error,"max_link_length_error_m":max_length_error,
            "max_local_translation_change_m":max_local_translation,"protected_curves_sha256":protected_after,
            "anchors_armature_space":{s:{"ankle":list(p),"quaternion_wxyz":list(q)} for s,(p,q) in anchors.items()},
            "export_requirement":"Preserve 0.25-frame Walk keys; independently verify exported sampler and actual skinned soles."}
