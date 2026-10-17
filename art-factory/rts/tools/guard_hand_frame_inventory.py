"""Read current guard rest geometry to define a real hand/forearm interface."""
import bpy,collections,hashlib,json,sys
import numpy as np
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).parent))
from guard_digit02_grip_diagnose import ROOT,GUARD,GUARD_SHA

RUN=ROOT/'art-factory/rts/runs/guard-right-hand-cage/2026-10-08-v9-character-frame'


def main():
    assert hashlib.sha256(GUARD.read_bytes()).hexdigest()==GUARD_SHA
    bpy.ops.wm.open_mainfile(filepath=str(GUARD));rig=bpy.data.objects['GuardRig20'];arm=bpy.data.objects['GuardArms_LOD0']
    bones={}
    for name in ('UpperArm_R','Forearm_R','Hand_R'):
        bone=rig.data.bones[name]
        bones[name]={'head_world':list(rig.matrix_world@bone.head_local),'tail_world':list(rig.matrix_world@bone.tail_local),
            'matrix_world_rest':[list(row) for row in rig.matrix_world@bone.matrix_local]}
    wrist=Vector(bones['Hand_R']['head_world']);axis=(wrist-Vector(bones['Forearm_R']['head_world'])).normalized()
    arm.data.calc_loop_triangles();vertices=[arm.matrix_world@v.co for v in arm.data.vertices]
    faces=[list(t.vertices) for t in arm.data.loop_triangles];neighbors={i:set() for i in range(len(vertices))}
    for edge in arm.data.edges:
        a,b=edge.vertices;neighbors[a].add(b);neighbors[b].add(a)
    unseen=set(neighbors);components=[];membership={}
    while unseen:
        start=unseen.pop();todo=[start];ids=[]
        while todo:
            index=todo.pop();ids.append(index);membership[index]=len(components)
            for neighbor in neighbors[index]:
                if neighbor in unseen:unseen.remove(neighbor);todo.append(neighbor)
        axial=[(vertices[i]-wrist).dot(axis) for i in ids]
        nearby=[i for i in ids if (vertices[i]-wrist).length<.15]
        groups=collections.Counter(arm.vertex_groups[g.group].name for i in ids for g in arm.data.vertices[i].groups if g.weight>.5)
        components.append({'component':len(components),'vertices':len(ids),'vertex_ids':sorted(ids),
            'axial_range_m':[min(axial),max(axial)],'minimum_distance_to_wrist_m':min((vertices[i]-wrist).length for i in ids),
            'near_wrist_vertices':len(nearby),'dominant_groups':dict(groups)})
    near_vertices=[]
    for i,p in enumerate(vertices):
        delta=p-wrist;t=delta.dot(axis);r=(delta-axis*t).length
        if abs(t)<.06 and r<.12:
            near_vertices.append({'vertex':i,'component':membership[i],'position':list(p),'axial_m':t,'radial_m':r,
                'groups':{arm.vertex_groups[g.group].name:g.weight for g in arm.data.vertices[i].groups}})
    slices=[]
    for offset in (-.024,-.018,-.012,-.006,0,.006,.012,.018,.024):
        point=wrist+axis*offset;intersections=[]
        for index,face in enumerate(faces):
            if not any((vertices[i]-wrist).length<.15 for i in face):continue
            points=[vertices[i] for i in face];signed=[(p-point).dot(axis) for p in points]
            if min(signed)>1e-8 or max(signed)<-1e-8:continue
            crossing=[]
            for j in range(3):
                k=(j+1)%3
                if abs(signed[j])<=1e-8:crossing.append(points[j])
                if signed[j]*signed[k]<-1e-16:crossing.append(points[j]+(points[k]-points[j])*(signed[j]/(signed[j]-signed[k])))
            unique={tuple(round(v,8) for v in p):p for p in crossing}
            if len(unique)==2:
                intersections.append({'face':index,'component':membership[face[0]],'points':[list(p) for p in unique.values()]})
        slices.append({'offset_m':offset,'segments':intersections,'segments_by_component':dict(collections.Counter(i['component'] for i in intersections))})
    report={'status':'current_character_measurement_only','source_guard_sha256':GUARD_SHA,'runtime_publish_allowed':False,
        'coordinate_system':'Blender character world metres, source rest mesh and rest bones; no posed/deformed evaluation',
        'rig_matrix_world':[list(row) for row in rig.matrix_world],'bones':bones,'wrist_bone_landmark':list(wrist),'forearm_axis_to_hand':list(axis),
        'arm_object_matrix_world':[list(row) for row in arm.matrix_world],'arm_vertices':len(vertices),'arm_triangles':len(faces),
        'arm_components':components,'near_wrist_vertices':near_vertices,'plane_slice_measurements':slices,
        'limitations':['Bone landmark is not itself a mesh interface','Plane segments are raw diagnostic intersections; no boundary or cut is approved yet']}
    (RUN/'raw').mkdir(parents=True,exist_ok=True);(RUN/'qa').mkdir(exist_ok=True)
    (RUN/'raw/current-arm-wrist-inventory.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print('HAND_FRAME_INVENTORY',json.dumps({'bones':bones,'forearm_axis_to_hand':list(axis),'components':[{k:v for k,v in c.items() if k!='vertex_ids'} for c in components],
        'near_wrist_vertex_count':len(near_vertices),'slices':[{k:v for k,v in s.items() if k!='segments'} for s in slices]}),flush=True)


if __name__=='__main__':main()
