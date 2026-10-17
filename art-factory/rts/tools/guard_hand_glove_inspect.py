"""Read-only v35 actual bone/cuff/sleeve interface inventory; no source saves."""
import sys,json,hashlib
from pathlib import Path
sys.dont_write_bytecode=True
import bpy,numpy as np
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/guard-hand-glove/2026-10-09-v1'
SOURCE=Path('C:/Users/bag57/projects/super_galen_site/.claude/worktrees/rts/art-factory/rts/runs/guard-right-hand-cage/2026-10-09-v35-shared-left-cloth-lod/candidate/guard-controlled-armor.blend')
EXPECTED='a5043a39f1a1b8ee38e4df72d5c8046f87bdab9adb2907171bf62b9ff7a27a29'
W=(.4293556809425354,0,.8472006916999817)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
if sha(SOURCE)!=EXPECTED:raise ValueError('v35 source changed')
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));rig=bpy.data.objects['GuardRig20'];rig.data.pose_position='REST';bpy.context.view_layer.update()
report={'source_path':SOURCE.as_posix(),'source_sha256':EXPECTED,'source_saved':False,'canonical_wrist_m':W,'bones':{},'objects':{},'wrist_ROI':{}}
for name in ('Forearm_R','Hand_R'):
 b=rig.data.bones[name];report['bones'][name]={'head_world':list(rig.matrix_world@b.head_local),'tail_world':list(rig.matrix_world@b.tail_local),'matrix_local':[list(row) for row in b.matrix_local]}
names=[o.name for o in bpy.data.objects if o.type=='MESH' and (('WristCuff_R' in o.name) or ('Hand' in o.name) or ('Arms_LOD0' in o.name) or ('ForearmArmor_R_LOD0' in o.name))]
forearm_axis=np.array(report['bones']['Forearm_R']['tail_world'])-np.array(report['bones']['Forearm_R']['head_world']);forearm_axis/=np.linalg.norm(forearm_axis)
for name in names:
 obj=bpy.data.objects[name];evaluated=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=evaluated.to_mesh();v=np.array([tuple(obj.matrix_world@p.co) for p in mesh.vertices]);mesh.calc_loop_triangles();tri=np.array([list(t.vertices) for t in mesh.loop_triangles]);mask=np.linalg.norm(v-np.array(W),axis=1)<.040;ids=np.flatnonzero(mask).tolist()
 report['objects'][name]={'vertices':len(v),'triangles':len(tri),'bounds_min_m':v.min(axis=0).tolist(),'bounds_max_m':v.max(axis=0).tolist(),'wrist_ROI_vertices':len(ids),'vertex_groups':[g.name for g in obj.vertex_groups]}
 if ids:report['wrist_ROI'][name]={'vertex_ids':ids,'positions_m':v[ids].tolist(),'triangles_touching_ROI':tri[np.any(mask[tri],axis=1)].tolist()}
 if name=='GuardArms_LOD0':
  report['actual_cloth_mesh']={'vertices_m':v.tolist(),'triangles':tri.tolist()}
  axial=(v-np.array(W))@forearm_axis;radial=np.linalg.norm((v-np.array(W))-axial[:,None]*forearm_axis,axis=1)
  selected=np.flatnonzero((abs(axial+.01667)<.001)&(radial<.060)&(v[:,0]>0)).tolist()
  report['actual_right_cloth_terminal']={'vertex_ids':selected,'positions_m':v[selected].tolist(),'axial_m':axial[selected].tolist(),'radius_m':radial[selected].tolist(),'all_touching_faces':[list(p.vertices) for p in mesh.polygons if any(i in selected for i in p.vertices)],'forearm_axis_world':forearm_axis.tolist()}
 if name=='GuardWristCuff_R_LOD0':report['actual_right_cuff']={'vertices_m':v.tolist(),'triangles':tri.tolist()}
 evaluated.to_mesh_clear()
if sha(SOURCE)!=EXPECTED:raise ValueError('Source mutated')
(RUN/'qa/v35-interface.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
print(json.dumps({'bones':report['bones'],'objects':report['objects']},indent=2))
