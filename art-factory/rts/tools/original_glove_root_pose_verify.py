"""Verify root, isolated distal and compound flexion on the actual skin."""
import bpy,json,hashlib,sys,math
from pathlib import Path
from mathutils import Matrix,Quaternion,Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).parent))
from original_glove_deformation import evaluated,crossings
from original_glove_build import apply
from original_glove_joint_rig import CURLS
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/original-glove-joints/2026-10-07-v2';source=RUN/'candidate/joint-rig.blend'
bpy.ops.wm.open_mainfile(filepath=str(source));rig=bpy.data.objects['OriginalHandRig_L'];obj=bpy.data.objects['OriginalJointGlove_L_LOD0'];rows=[]
source_blend_sha=hashlib.sha256(source.read_bytes()).hexdigest();glb='--glb' in sys.argv
if glb:
 axes={b.name:rig.matrix_world.to_3x3()@Vector(b['original_flexion_axis']) for b in rig.data.bones if 'original_flexion_axis' in b}
 source=RUN/'candidate/glove-l-lod0.glb';bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(source))
 rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');obj=bpy.data.objects['OriginalJointGlove_L_LOD0']
 for name,axis in axes.items():rig.data.bones[name]['original_flexion_axis']=list((rig.matrix_world.inverted().to_3x3()@axis).normalized())
rig.animation_data_clear()
for case in ['root','joint2','joint3','distal_compound']:
 for digit in CURLS:
  for sample in range(33):
   amount=sample/32;matrices={b.name:b.matrix_local.copy() for b in rig.data.bones};head=rig.data.bones[digit+'1_L'].head_local.copy();rotation=Quaternion()
   for i,angle in enumerate(CURLS[digit],1):
    bone=rig.data.bones[f'{digit}{i}_L'];active=(i==1 if case=='root' else i==2 if case=='joint2' else i==3 if case=='joint3' else i>1)
    rotation=rotation@Quaternion(Vector(bone['original_flexion_axis']),math.radians(angle)*amount*active);q=rotation@bone.matrix_local.to_quaternion();matrices[bone.name]=Matrix.LocRotScale(head,q,Vector((1,1,1)));head+=q@Vector((0,bone.length,0))
   apply(rig,matrices);bpy.context.view_layer.update();points,faces=evaluated(obj);tree=BVHTree.FromPolygons(points,faces,all_triangles=True);bad=[]
   for a,b in tree.overlap(tree):
    if a<b and len(set(faces[a])&set(faces[b]))<2 and crossings([points[i] for i in faces[a]],[points[i] for i in faces[b]]):bad.append([a,b])
   rows.append({'case':case,'digit':digit,'amount':amount,'crossings':len(bad),'first_triangle_pairs':bad[:10]})
report={'status':'qa_failed','source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'axes_source_blend_sha256':source_blend_sha,'actual_glb_reimport':glb,'poses':rows,'pass':all(r['crossings']==0 for r in rows),'scope':'660 evaluated poses: each root, joint2, joint3 and distal compound; 33 angles each. GLB mode applies world-aligned final source axes to actual reimported bones and triangle skin. Noncoplanar triangle crossings excluding shared edges. Not all-joint grasp, source/GLB isolated-vertex parity or commercial acceptance.','runtime_publish_allowed':False}
(RUN/('qa/isolated-and-compound-glb.json' if glb else 'qa/isolated-and-compound.json')).write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'actual_glb_reimport':glb,'poses':len(rows),'failed':sum(r['crossings']>0 for r in rows),'max_crossings':max(r['crossings'] for r in rows)}));assert report['pass']
