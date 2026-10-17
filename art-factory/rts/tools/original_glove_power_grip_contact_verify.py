"""Verify unchanged source binding and actual Blender pad contact/normals."""
import bpy,json,sys,hashlib
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).parent))
from original_glove_deformation import evaluated
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/original-glove-power-grip/2026-10-07-v1'
t=json.loads((RUN/'raw/grip-target.json').read_text());h=json.loads((RUN/'raw/hand.json').read_text());w=json.loads((RUN/'raw/weapon.json').read_text());source=RUN/'candidate/support-grip.blend'
bpy.ops.wm.open_mainfile(filepath=str(source));rig=bpy.data.objects['OriginalHandRig_L'];hand=bpy.data.objects['OriginalJointGlove_L_LOD0'];weapon=bpy.data.objects['OriginalContactCrossbow'];bpy.context.scene.frame_set(18);bpy.context.view_layer.update()
rest_error=max((v.co-Vector(p)).length for v,p in zip(hand.data.vertices,h['points']))
actual_weights=[{hand.vertex_groups[g.group].name:g.weight for g in v.groups} for v in hand.data.vertices]
assert actual_weights==h['weights'];hand.data.calc_loop_triangles();assert [list(f.vertices) for f in hand.data.loop_triangles]==h['faces']
for name,b in rig.data.bones.items():
    assert (b.head_local-Vector(h['bones'][name]['head'])).length<1e-8
    assert (b.tail_local-Vector(h['bones'][name]['tail'])).length<1e-8
wp,wf=evaluated(weapon);sf=[f for f,name in zip(w['faces'],w['face_parts']) if name=='support_grip'];st=BVHTree.FromPolygons(wp,sf,all_triangles=True)
e=hand.evaluated_get(bpy.context.evaluated_depsgraph_get());m=e.to_mesh();points=[e.matrix_world@v.co for v in m.vertices];normals=[(e.matrix_world.to_3x3()@v.normal).normalized() for v in m.vertices]
def contact(ids,count):
    result=[]
    for i in ids:
        closest,n,face,d=st.find_nearest(points[i]);result.append({'vertex':i,'distance_m':d,'normal_opposition':-normals[i].dot(n),'support_triangle':face})
    return sorted(result,key=lambda r:r['distance_m'])[:count]
rows={name:contact(ids,3) for name,ids in t['contact_vertex_ids'].items()};palms=[contact(ids,2) for ids in t['palm_contact_groups']];e.to_mesh_clear()
passed=rest_error<1e-8 and all(len(v)==3 and max(r['distance_m'] for r in v)<.0015 and min(r['normal_opposition'] for r in v)>.5 for v in rows.values()) and all(sum(r['distance_m'] for r in v)/len(v)<=.0031 for v in palms)
report={'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'pass':passed,'rest_position_error_m':rest_error,'rest_topology_unchanged':True,'all_weights_unchanged':True,'bone_heads_and_tails_unchanged':True,'digit_contacts':rows,'distal_palm_regions':palms,'scope':'Actual hold-frame palmar sample vertices nearest actual support triangles and outward normal opposition. This proves small gaps in selected contact patches, not tactile force/friction or commercial art approval.','runtime_publish_allowed':False}
(RUN/'qa/contact-and-preservation.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report));assert passed
