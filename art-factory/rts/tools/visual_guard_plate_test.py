"""Source armor regions must survive as closed, singly bound rigid shells."""
import argparse,json,sys
from pathlib import Path
import bpy,bmesh,numpy as np
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).parent))
import procedural_gauntlet_build as g
from visual_guard_armor_test import armor_core,WRISTS
from visual_knight_motion_test import positions

p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--reference',type=Path,required=True);p.add_argument('--report',type=Path,required=True)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);bpy.ops.wm.open_mainfile(filepath=str(a.reference.resolve()));rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
cores={(lod,side,part):set(armor_core(bpy.data.objects[f'GuardBody_LOD{lod}'],rig,side,part)) for lod in (0,1) for side in 'LR' for part in ('UpperArm','Forearm')}
g.set_action(rig,'Death');reference_wrists={}
for frame in np.linspace(*bpy.data.actions['Death'].frame_range,1+int(bpy.data.actions['Death'].frame_range[1]-bpy.data.actions['Death'].frame_range[0])*4):
    bpy.context.scene.frame_set(int(frame),subframe=float(frame%1));reference_wrists[float(frame)]={side:rig.pose.bones['Forearm_'+side].matrix@rig.data.bones['Forearm_'+side].matrix_local.inverted()@WRISTS[side] for side in 'LR'}
bpy.ops.wm.open_mainfile(filepath=str(a.source.resolve()));rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');plates=[o for o in bpy.data.objects if o.name.startswith('GuardRigidPlate_')]
failures=[];rows=[];maximum_wrist_error=0
if len(plates)!=8:failures.append('Both LODs require all four original rigid armor plates')
for obj in plates:
    lod=int(obj['source_lod']);side=obj['side'];part=obj['part'];ids=set(json.loads(obj['source_vertex_ids']));missing=cores[lod,side,part]-ids
    bm=bmesh.new();bm.from_mesh(obj.data);bad=sum(not e.is_manifold for e in bm.edges);volume=bm.calc_volume(signed=True);bm.free()
    row={'object':obj.name,'source_core_vertices':len(cores[lod,side,part]),'missing_core_vertices':sorted(missing),'nonmanifold_edges':bad,'signed_volume':volume,'maximum_rigid_error_m':0};rows.append(row)
    if missing or bad or volume<=0:failures.append(obj.name+': missing source armor or invalid closed shell')
    for vertex in obj.data.vertices:
        weights={obj.vertex_groups[w.group].name:w.weight for w in vertex.groups if w.weight>1e-7}
        if weights!={part+'_'+side:1.0}:failures.append(obj.name+': armor is not rigidly bound');break
for action in bpy.data.actions:
    g.set_action(rig,action.name)
    for frame in np.linspace(*action.frame_range,1+int(action.frame_range[1]-action.frame_range[0])*4):
        bpy.context.scene.frame_set(int(frame),subframe=float(frame%1))
        if action.name=='Death':
            for side in 'LR':
                fore=rig.pose.bones['Forearm_'+side];wrist=fore.matrix@fore.bone.matrix_local.inverted()@WRISTS[side]
                maximum_wrist_error=max(maximum_wrist_error,(wrist-reference_wrists[float(frame)][side]).length)
        for obj,row in zip(plates,rows):
            bone=rig.pose.bones[obj['part']+'_'+obj['side']];skin=rig.matrix_world@bone.matrix@bone.bone.matrix_local.inverted();points=positions(obj)
            error=max((Vector(points[v.index])-skin@v.co).length for v in obj.data.vertices)
            row['maximum_rigid_error_m']=max(row['maximum_rigid_error_m'],error)
for row in rows:
    if row['maximum_rigid_error_m']>.003:failures.append(row['object']+': armor bends more than 3 mm')
if maximum_wrist_error>.001:failures.append('Canonical wrist drifts from the original hand attachment by more than 1 mm')
report={'source':str(a.source),'reference':str(a.reference),'plates':rows,'maximum_anatomical_wrist_error_m':maximum_wrist_error,'failures':failures,'artistic_quality_proven':False}
a.report.parent.mkdir(parents=True,exist_ok=True);a.report.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report));assert not failures,'; '.join(failures)
