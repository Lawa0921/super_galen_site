"""Actual GLB skin parity and full simultaneous hand self-crossing checks."""
import bpy,json,hashlib,sys
from pathlib import Path
from mathutils.kdtree import KDTree
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).parent))
from original_glove_deformation import evaluated,crossings
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/original-glove-power-grip/2026-10-07-v1'
source=RUN/'candidate/natural-hand.blend';glb=RUN/'candidate/natural-hand.glb'
def pose(rig,f):
    action=next(a for a in bpy.data.actions if a.name=='NaturalCurl' or a.name.endswith('|NaturalCurl'))
    rig.animation_data.action=action;rig.animation_data.action_slot=action.slots[0]
    for track in rig.animation_data.nla_tracks:track.mute=True
    bpy.context.scene.frame_set(int(f),subframe=f%1);bpy.context.view_layer.update()
def skin(rig):return {b.name:rig.matrix_world@b.matrix@b.bone.matrix_local.inverted() for b in rig.pose.bones}
bpy.ops.wm.open_mainfile(filepath=str(source));rig=bpy.data.objects['OriginalHandRig_L'];hand=bpy.data.objects['OriginalJointGlove_L_LOD0'];samples={}
pose(rig,0);rig.data.pose_position='REST';bpy.context.view_layer.update();rest=evaluated(hand)[0];rig.data.pose_position='POSE'
for i in range(385):
    f=i/8;pose(rig,f);samples[f]={'points':evaluated(hand)[0],'skin':skin(rig)}
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(glb));rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');hand=bpy.data.objects['OriginalJointGlove_L_LOD0']
pose(rig,0);rig.data.pose_position='REST';bpy.context.view_layer.update();points=evaluated(hand)[0];tree=KDTree(len(rest))
for i,p in enumerate(rest):tree.insert(p,i)
tree.balance();mapping=[tree.find(p)[1] for p in points];rest_error=max(tree.find(p)[2] for p in points)
assert len(set(mapping))==len(rest),'Rest mapping not bijective'
rig.data.pose_position='POSE';rows=[];max_surface=0;max_skin=0
for f,expected in samples.items():
    pose(rig,f);hp,hf=evaluated(hand);actual_skin=skin(rig)
    max_surface=max(max_surface,max((p-expected['points'][mapping[i]]).length for i,p in enumerate(hp)))
    max_skin=max(max_skin,max(abs(m[a][b]-expected['skin'][name][a][b]) for name,m in actual_skin.items() for a in range(4) for b in range(4)))
    ht=BVHTree.FromPolygons(hp,hf,all_triangles=True)
    bad=[[a,b] for a,b in ht.overlap(ht) if a<b and len(set(hf[a])&set(hf[b]))<2 and crossings([hp[i] for i in hf[a]],[hp[i] for i in hf[b]])]
    zeros=sum((hp[b]-hp[a]).cross(hp[c]-hp[a]).length<1e-12 for a,b,c in hf)
    rows.append({'frame':f,'self_crossings':len(bad),'zero_area_triangles':zeros})
passed=rest_error<1e-6 and max_surface<1e-5 and max_skin<1e-4 and all(r['self_crossings']==0 and r['zero_area_triangles']==0 for r in rows)
report={'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'glb_sha256':hashlib.sha256(glb.read_bytes()).hexdigest(),'rest_error_m':rest_error,'max_surface_error_m':max_surface,'max_skin_matrix_error':max_skin,'poses':rows,'pass':passed,'scope':'385 actual GLB samples vs source; rest bijection, actual triangle noncoplanar self-crossings excluding shared edges. No weapon/character fit, coplanar overlap or commercial art approval.','runtime_publish_allowed':False}
(RUN/'qa/natural-motion-glb.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items() if k!='poses'}));assert passed
