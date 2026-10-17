"""Author original simultaneous finger motion on the corrected original skin.

An animation study only: no weapon fit, final material or character approval.
"""
import bpy,json,sys,math,hashlib
from pathlib import Path
from mathutils import Matrix,Vector,Quaternion
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).parent))
from original_glove_build import apply
from original_glove_deformation import evaluated,crossings

ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/original-glove-power-grip/2026-10-07-v1'
source=RUN/'candidate/semantic-rig.blend'
target=json.loads((RUN/'raw/feasible-hand-seed.json').read_text())
binding=json.loads((RUN/'raw/hand.json').read_text())
bpy.ops.wm.open_mainfile(filepath=str(source))
rig=bpy.data.objects['OriginalHandRig_L'];hand=bpy.data.objects['OriginalJointGlove_L_LOD0']
scene=bpy.context.scene
rig.animation_data_clear()
for action in list(bpy.data.actions):bpy.data.actions.remove(action)
for obj in list(scene.objects):
    if obj not in (rig,hand):bpy.data.objects.remove(obj,do_unlink=True)

def matrices(amount):
    result={'Hand_L':rig.data.bones['Hand_L'].matrix_local.copy()}
    for name,angles in target['angles_degrees'].items():
        head=rig.data.bones[name+'1_L'].head_local.copy()
        swing=target['root_swings'][name]
        rotation=Quaternion(Vector(swing['axis']),math.radians(swing['degrees'])*amount)
        for index,angle in enumerate(angles,1):
            bone=rig.data.bones[f'{name}{index}_L']
            rotation=rotation@Quaternion(Vector(bone['original_flexion_axis']),math.radians(angle)*amount)
            q=rotation@bone.matrix_local.to_quaternion()
            result[bone.name]=Matrix.LocRotScale(head,q,Vector((1,1,1)))
            head+=q@Vector((0,bone.length,0))
    return result

scene.frame_start=0;scene.frame_end=48;scene.render.fps=24
action=bpy.data.actions.new('NaturalCurl');rig.animation_data_create();rig.animation_data.action=action
previous={}
for sample in range(193):
    frame=sample/4
    t=min(1,frame/18) if frame<=24 else max(0,1-(frame-24)/18)
    apply(rig,matrices(t*t*(3-2*t)))
    for bone in rig.pose.bones:
        if bone.name in previous:bone.rotation_quaternion.make_compatible(previous[bone.name])
        previous[bone.name]=bone.rotation_quaternion.copy()
        for key in ('location','rotation_quaternion','scale'):bone.keyframe_insert(data_path=key,frame=frame,group=bone.name)
for layer in action.layers:
    for strip in layer.strips:
        for slot in action.slots:
            bag=strip.channelbag(slot)
            if bag:
                for curve in bag.fcurves:
                    for key in curve.keyframe_points:key.interpolation='LINEAR'

scene.frame_set(0);bpy.context.view_layer.update()
assert len(hand.data.vertices)==len(binding['points'])
assert max((v.co-Vector(p)).length for v,p in zip(hand.data.vertices,binding['points']))<1e-9
candidate=RUN/'candidate/natural-hand.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(candidate))
rows=[];start=None
for sample in range(385):
    frame=sample/8;scene.frame_set(int(frame),subframe=frame%1);bpy.context.view_layer.update()
    points,faces=evaluated(hand);tree=BVHTree.FromPolygons(points,faces,all_triangles=True)
    bad=[[a,b] for a,b in tree.overlap(tree) if a<b and len(set(faces[a])&set(faces[b]))<2 and crossings([points[i] for i in faces[a]],[points[i] for i in faces[b]])]
    if start is None:start=points
    zeros=sum((points[b]-points[a]).cross(points[c]-points[a]).length<1e-12 for a,b,c in faces)
    rows.append({'frame':frame,'self_crossings':len(bad),'first_pairs':bad[:12],'zero_area_triangles':zeros,'bone_length_relative_error':max(abs((b.tail-b.head).length/b.bone.length-1) for b in rig.pose.bones),'loop_error_m':max((a-b).length for a,b in zip(start,points)) if frame==48 else 0})
report={'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'candidate_sha256':hashlib.sha256(candidate.read_bytes()).hexdigest(),'binding_sha256':hashlib.sha256((RUN/'raw/hand.json').read_bytes()).hexdigest(),'target':target,'poses':rows,'pass':all(not r['self_crossings'] and not r['zero_area_triangles'] and r['bone_length_relative_error']<1e-5 and r['loop_error_m']<1e-6 for r in rows),'scope':'385 evaluated simultaneous five-finger poses; noncoplanar triangle crossings excluding shared edges. Preserves original rest geometry and bone lengths. Not a weapon grip or commercial character acceptance.','runtime_publish_allowed':False}
(RUN/'qa/natural-motion-source.json').write_text(json.dumps(report,indent=2)+'\n')
print('NATURAL_MOTION',json.dumps({'pass':report['pass'],'poses':len(rows),'failed':sum(r['self_crossings']>0 for r in rows),'max_crossings':max(r['self_crossings'] for r in rows)}),flush=True)
assert report['pass']
