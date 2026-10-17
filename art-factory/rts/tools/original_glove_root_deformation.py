"""Inspect actual authored hand binding and surfaces at original motion poses."""
import bpy,json,hashlib,sys
from pathlib import Path
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).parent))
from original_glove_deformation import evaluated,crossings
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/original-glove-joints/2026-10-07-v2'
baseline='--baseline' in sys.argv;glb='--glb' in sys.argv
source=RUN/('candidate/joint-surface.blend' if baseline else 'candidate/glove-l-lod0.glb' if glb else 'candidate/joint-rig.blend')
if glb:
    bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.scene.render.fps=24;bpy.ops.import_scene.gltf(filepath=str(source))
else:bpy.ops.wm.open_mainfile(filepath=str(source))
rigs=[o for o in bpy.context.scene.objects if o.type=='ARMATURE'];rig=rigs[0] if len(rigs)==1 else None
objects=[o for o in bpy.context.scene.objects if o.type=='MESH' and (rig is None or o.find_armature() is rig)];assert len(objects)==1;obj=objects[0]
actions=[a for a in bpy.data.actions if a.name=='OpenClose' or a.name.endswith('|OpenClose')]
if glb and rig and actions:
    rig.animation_data_create();rig.animation_data.action=actions[0];rig.animation_data.action_slot=actions[0].slots[0]
    for track in rig.animation_data.nla_tracks:track.mute=True
tests={'sixteen_original_bones':rig is not None and len(rig.data.bones)==16,'original_openclose_action':len(actions)==1,'normalized_weights':all(v.groups and abs(sum(g.weight for g in v.groups)-1)<1e-6 for v in obj.data.vertices),'maximum_four_weights':all(len(v.groups)<=4 for v in obj.data.vertices)}
rows=[];step=.5 if '--dense' in sys.argv else None
frames=[i*step for i in range(97)] if step else [0,9,18,24,33,42,48]
if all(tests.values()):
    start=None;wrist=[v.index for v in obj.data.vertices if v.co.z<.02]
    assert wrist,'Wrist regression needs witness vertices'
    for frame in frames:
        bpy.context.scene.frame_set(int(frame),subframe=frame%1);bpy.context.view_layer.update();points,faces=evaluated(obj)
        if start is None:start=points
        bvh=BVHTree.FromPolygons(points,faces,all_triangles=True);bad=[];regions={}
        for a,b in bvh.overlap(bvh):
            if a>=b or len(set(faces[a])&set(faces[b]))>=2:continue
            if crossings([points[i] for i in faces[a]],[points[i] for i in faces[b]]):
                bad.append([a,b]);names=[]
                for face in [faces[a],faces[b]]:
                    scores={}
                    for i in face:
                        for g in obj.data.vertices[i].groups:
                            key=obj.vertex_groups[g.group].name;scores[key]=scores.get(key,0)+g.weight
                    names.append(max(scores,key=scores.get))
                key='/'.join(sorted(names));regions[key]=regions.get(key,0)+1
        rows.append({'frame':frame,'crossings':len(bad),'regions':regions,'first_triangle_pairs':bad[:20],'wrist_drift_m':max((points[i]-start[i]).length for i in wrist),'zero_area_faces':sum((points[b]-points[a]).cross(points[c]-points[a]).length<1e-12 for a,b,c in faces),'bone_length_relative_error':max(abs((b.tail-b.head).length/b.bone.length-1) for b in rig.pose.bones),'loop_endpoint_error_m':max((p-start[i]).length for i,p in enumerate(points)) if frame==48 else 0})
report={'status':'qa_failed','source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'baseline':baseline,'binding_tests':tests,'poses':rows,'sampled_deformation_pass':bool(rows) and all(tests.values()) and all(r['crossings']==0 and r['wrist_drift_m']<1e-6 and r['zero_area_faces']==0 and r['bone_length_relative_error']<1e-5 and r['loop_endpoint_error_m']<1e-6 for r in rows),'scope':'Evaluated Blender surfaces; noncoplanar triangle crossings excluding shared edges. Not GLB parity, weapon fitting or commercial art acceptance.','runtime_publish_allowed':False}
name='binding-baseline.json' if baseline else 'deformation-'+('glb-' if glb else '')+('dense' if step else 'coarse')+'.json'
(RUN/'qa'/name).write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'binding':tests,'pass':report['sampled_deformation_pass'],'poses':len(rows),'crossings_by_frame':{r['frame']:r['crossings'] for r in rows}}));assert report['sampled_deformation_pass']
