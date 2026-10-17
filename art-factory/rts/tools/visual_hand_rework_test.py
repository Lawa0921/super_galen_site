"""Check the actual glove mesh, including both hands and both LODs.

Run in Blender; this checks topology/weights, not artistic acceptance.
"""
import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).parent))
import procedural_gauntlet_build as g


def inspect_glove(obj):
    leather = {
        i for i, material in enumerate(obj.data.materials)
        if "leather" in material.name.lower()
    }
    faces = [p for p in obj.data.polygons if p.material_index in leather]
    adjacency = {}
    edges = {}
    for face in faces:
        for a, b in face.edge_keys:
            adjacency.setdefault(a, set()).add(b)
            adjacency.setdefault(b, set()).add(a)
            key = tuple(sorted((a, b)))
            edges[key] = edges.get(key, 0) + 1
    remaining = set(adjacency)
    components = []
    while remaining:
        stack = [remaining.pop()]
        count = 0
        while stack:
            vertex = stack.pop()
            count += 1
            neighbours = adjacency[vertex] & remaining
            remaining.difference_update(neighbours)
            stack.extend(neighbours)
        components.append(count)
    weights = [sum(g.weight for g in v.groups) for v in obj.data.vertices]
    return {
        "object": obj.name,
        "leather_components": sorted(components, reverse=True),
        "non_manifold_leather_edges": sum(count != 2 for count in edges.values()),
        "unweighted_vertices": sum(w < 0.999 or w > 1.001 for w in weights),
        "vertices": len(weights),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--all-poses", action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    bpy.ops.wm.open_mainfile(filepath=str(args.source.resolve()))
    rig = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    g.set_action(rig, "Idle")
    bpy.context.scene.frame_set(0)
    skin = g.skin_matrices(rig)
    neutral_wrist={side:rig.pose.bones['Forearm_'+side].matrix.to_quaternion().inverted()@rig.pose.bones['Hand_'+side].matrix.to_quaternion() for side in 'LR'}
    objects = [o for o in bpy.data.objects if o.type == "MESH" and o.name.startswith("GuardGauntlet_")]
    rows = [inspect_glove(o) for o in objects]
    failures = []
    if len(rows) != 4:
        failures.append(f"Expected left/right hands at both LODs; got {len(rows)}")
    for row in rows:
        obj=bpy.data.objects[row['object']]
        used_groups={w.group for v in obj.data.vertices for w in v.groups if w.weight>0}
        invalid=[obj.vertex_groups[i].name for i in used_groups if obj.vertex_groups[i].name not in skin]
        row['invalid_bone_groups']=invalid
        if invalid:
            failures.append(f"{row['object']}: weights reference missing bones: {invalid}")
        if len(row["leather_components"]) != 1:
            failures.append(f"{row['object']}: glove is disconnected pieces, not a continuous palm and fingers")
        if row["non_manifold_leather_edges"]:
            failures.append(f"{row['object']}: open or non-manifold glove surface")
        if row["unweighted_vertices"]:
            failures.append(f"{row['object']}: skin weights are not normalized")
        if "_R_" in row["object"] and not invalid:
            obj = bpy.data.objects[row["object"]]
            weapon = bpy.data.objects["KingdomSteelSword_" + obj.name.rsplit("_", 1)[1]]
            center, axis, radius, low, high = g.weapon_region(weapon, {"AssemblyDetail_leather", "WornLeather"})
            center = skin["Hand_R"] @ center
            axis = (skin["Hand_R"].to_3x3() @ axis).normalized()
            close = 0
            for vertex in obj.data.vertices:
                point = sum((skin[obj.vertex_groups[w.group].name] @ vertex.co * w.weight
                             for w in vertex.groups), Vector())
                delta = point-center
                along = delta.dot(axis)
                radial = (delta-axis*along).length
                if low < along < high and abs(radial-radius) < .006:
                    close += 1
            row["handle_contact_vertices"] = close
            if close < 15:
                failures.append(f"{row['object']}: glove does not contact the actual posed sword grip")
    poses=[]
    if args.all_poses and not any(r['invalid_bone_groups'] for r in rows):
        def positions(obj,matrices):
            return [sum((matrices[obj.vertex_groups[w.group].name]@v.co*w.weight for w in v.groups),Vector()) for v in obj.data.vertices]
        baseline={o.name:positions(o,skin) for o in objects}
        edge_lengths={o.name:[(baseline[o.name][e.vertices[0]]-baseline[o.name][e.vertices[1]]).length for e in o.data.edges] for o in objects}
        source_records=Path(__file__).resolve().parents[3]/'art-factory/rts/runs/all-models/2026-10-14-v1/qa/guard-build.json'
        wrists={r['side']:Vector(r['cut']['wrist']) for r in json.loads(source_records.read_bytes())['hands'] if r['lod']==0}
        for action in bpy.data.actions:
            g.set_action(rig,action.name)
            worst=0;worst_edge=None;frames=range(int(action.frame_range[0]),int(action.frame_range[1])+1)
            contact_min=10**9
            wrist_gap=0
            wrist_angle=0;weapon_floor=1e9
            for frame in frames:
                bpy.context.scene.frame_set(frame);matrices=g.skin_matrices(rig)
                for side,point in wrists.items():
                    wrist_gap=max(wrist_gap,(matrices['Hand_'+side]@point-matrices['Forearm_'+side]@point).length)
                    relative=rig.pose.bones['Forearm_'+side].matrix.to_quaternion().inverted()@rig.pose.bones['Hand_'+side].matrix.to_quaternion()
                    angle=neutral_wrist[side].rotation_difference(relative).angle
                    wrist_angle=max(wrist_angle,math.degrees(min(angle,2*math.pi-angle)))
                for obj in objects:
                    points=positions(obj,matrices)
                    if not all(math.isfinite(c) for v in points for c in v):failures.append(f'{action.name}:{frame}:{obj.name}: non-finite posed vertex')
                    for edge,old_length in zip(obj.data.edges,edge_lengths[obj.name]):
                        length=(points[edge.vertices[0]]-points[edge.vertices[1]]).length
                        if old_length>.0001 and length/old_length>worst:
                            worst=length/old_length
                            worst_edge={'object':obj.name,'frame':frame,'edge':edge.index,'reference_length_m':old_length,'posed_length_m':length,
                                        'vertex_indices':list(edge.vertices)}
                    if '_R_' in obj.name:
                        weapon=bpy.data.objects['KingdomSteelSword_'+obj.name.rsplit('_',1)[1]]
                        weapon_floor=min(weapon_floor,min((matrices['Hand_R']@v.co).z for v in weapon.data.vertices))
                        center,axis,radius,low,high=g.weapon_region(weapon,{'AssemblyDetail_leather','WornLeather'})
                        center=matrices['Hand_R']@center;axis=(matrices['Hand_R'].to_3x3()@axis).normalized()
                        count=0
                        for point in points:
                            delta=point-center;along=delta.dot(axis);radial=(delta-axis*along).length
                            if low<along<high and abs(radial-radius)<.006:count+=1
                        contact_min=min(contact_min,count)
            poses.append({'clip':action.name,'frames_checked':len(frames),'maximum_edge_stretch':worst,'worst_edge':worst_edge,'maximum_wrist_pivot_gap_m':wrist_gap,'maximum_wrist_rotation_from_idle_degrees':wrist_angle,'minimum_sword_z':weapon_floor,'minimum_right_grip_contact_vertices':contact_min})
            if worst>2:failures.append(f'{action.name}: hand surface stretches more than 2x')
            if wrist_gap>.001:failures.append(f'{action.name}: Hand and Forearm separate at the anatomical wrist pivot')
            if contact_min<15:failures.append(f'{action.name}: hand loses sword contact during animation')
            if wrist_angle>30.1:failures.append(f'{action.name}: wrist rotates more than 30 degrees from its neutral grip')
            if weapon_floor<-.005:failures.append(f'{action.name}: sword penetrates ground')
    report = {"source": str(args.source), "hands": rows, "poses":poses,"failures": failures,
              "artistic_quality_proven": False}
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_bytes((json.dumps(report, indent=2) + "\n").encode())
    print(json.dumps(report))
    if failures:
        raise AssertionError("; ".join(failures))


if __name__ == "__main__":
    main()
