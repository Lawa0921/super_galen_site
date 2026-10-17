"""Candidate-only common-reference cuff skinning experiment.

The old cuff was authored by inverting a blend of incompatible bind frames.
Rebase new band vertices to their actual Idle shape and drive four helper
bones from the unchanged original motion. Cut vertices and all source art
remain untouched. This is evaluated, not automatically accepted.
"""
import bpy,json,sys,hashlib
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).parent))
from original_crossbow_attack_probe import activate
from original_glove_deformation import evaluated
from original_crossbow_carry_build import put_keys
ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/original-crossbow-cuff-motion/2026-10-07-v1'
SOURCE=ROOT/'art-factory/rts/runs/original-crossbow-articulated-hand/2026-10-07-v1/candidate/articulated-connector.blend'
if '--arc' in sys.argv:SOURCE=RUN/'raw/cuff-contour.blend'
else:assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()=='18f063e7111f65b45464f9202d87423a2c52540318532b15e6374c4da78f3939'
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));rig=bpy.data.objects['crossbowRig20'];activate(rig,'Idle',0)
names=['UpperArm_L','Forearm_L','Hand_L','HandPalm_L'];mapping={n:'CuffRef_'+n for n in names}
neutral={n:rig.pose.bones[n].matrix.copy() for n in names}
body_points={lod:evaluated(bpy.data.objects[f'crossbowOriginalBody_LOD{lod}'])[0] for lod in (0,1)}
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='EDIT')
for source,name in mapping.items():
    bone=rig.data.edit_bones.new(name);bone.head=neutral[source].translation;bone.tail=neutral[source]@Vector((0,.04,0));bone.matrix=neutral[source]
bpy.ops.object.mode_set(mode='OBJECT')
for clip in ['Idle','Walk','Attack','Hurt','Death']:
    action=activate(rig,clip,0);captured={}
    for i in range(round(action.frame_range[1])*8+1):
        frame=i/8;activate(rig,clip,frame);captured[frame]={mapping[n]:rig.pose.bones[n].matrix.copy() for n in names}
    put_keys(rig,action,captured,set(mapping.values()))
activate(rig,'Idle',0);rows=[]
for lod,points in body_points.items():
    body=bpy.data.objects[f'crossbowOriginalBody_LOD{lod}'];mark=body.data.attributes['ArticulatedCuff'];groups={n:body.vertex_groups.new(name=p) for n,p in mapping.items()};count=0
    for v in body.data.vertices:
        if mark.data[v.index].value!=1:continue
        weights={body.vertex_groups[g.group].name:g.weight for g in v.groups if g.weight>0}
        assert set(weights)<=set(names),weights
        for group in body.vertex_groups:group.remove([v.index])
        for name,weight in weights.items():groups[name].add([v.index],weight,'REPLACE')
        v.co=points[v.index];count+=1
    body.data.update();current=evaluated(body)[0];error=max((p-q).length for p,q in zip(points,current));assert error<1e-5,error
    rows.append({'lod':lod,'rebased_vertices':count,'idle_surface_max_error_m':error})
output=RUN/('iterations/cuff-contour-reference.blend' if '--arc' in sys.argv else 'iterations/cuff-reference.blend');bpy.ops.wm.save_as_mainfile(filepath=str(output))
report={'source_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'candidate_sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'bones':len(rig.data.bones),'records':rows,'runtime_publish_allowed':False}
(RUN/'qa/rebase-authoring.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8',newline='\n');print(json.dumps(report))
