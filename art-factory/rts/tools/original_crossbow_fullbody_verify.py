"""Evaluate the authored candidate, independently of the authoring IK outputs."""
import bpy,json,math,hashlib,sys
from pathlib import Path
from mathutils import Vector,Matrix
sys.path.insert(0,str(Path(__file__).parent))
from original_crossbow_attack_probe import activate
from original_crossbow_fullbody_build import RUN,ANCHOR_PATH,CONTACT
SOURCE=RUN/'candidate/complete-crossbow.blend'
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));rig=bpy.data.objects['crossbowRig20']
anchor=Matrix(json.loads(ANCHOR_PATH.read_text())['source_bones']['Hand_L']['matrix'])
pinch=Vector(json.loads((RUN/'raw/pinch-layout.json').read_text())['contact_source'])
def evaluated(obj):
    e=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=e.to_mesh();mesh.calc_loop_triangles()
    points=[e.matrix_world@v.co for v in mesh.vertices];faces=[tuple(t.vertices) for t in mesh.loop_triangles]
    e.to_mesh_clear();return points,faces
def area(points,face):
    a,b,c=[points[i] for i in face];return (b-a).cross(c-a).length*.5
def matrix_error(a,b):return max(abs(a[i][j]-b[i][j]) for i in range(4) for j in range(4))
hand=bpy.data.objects['OriginalCrossbowArticulatedHand_L'];body=bpy.data.objects['crossbowOriginalBody_LOD0']
activate(rig,'Idle',0);points,faces=evaluated(hand)
marker=hand.data.attributes['TailoredGauntlet']
ids=[i for i,face in enumerate(faces) if any(marker.data[v].value for v in face)]
initial={i:area(points,faces[i]) for i in ids};assert min(initial.values())>1e-10
floor_ids=[v.index for v in body.data.vertices if any(body.vertex_groups[g.group].name in ('Foot_L','Foot_R') and g.weight>.75 for g in v.groups)]
feet={};grasp=None;rows=[];last=None
for k in range(72*16+1):
    f=k/16;activate(rig,'Attack',f);m={b.name:b.matrix.copy() for b in rig.pose.bones}
    palm=m['HandPalm_L'].translation
    roots=sum((m[n+'1_L'].translation for n in ('Index','Middle','Ring','Little')),Vector())/4
    wrist=math.degrees((palm-m['Forearm_L'].translation).angle(roots-palm))
    length_errors=[]
    for side in ('L','R'):
        for a,b in [('Thigh','Shin'),('Shin','Foot'),('UpperArm','Forearm')]:
            length_errors.append(abs((m[a+'_'+side].translation-m[b+'_'+side].translation).length-rig.data.bones[a+'_'+side].length))
        end=m['HandPalm_L' if side=='L' else 'Hand_R'].translation
        length_errors.append(abs((m['Forearm_'+side].translation-end).length-rig.data.bones['Forearm_'+side].length))
    foot_error=0
    if f==6:feet={s:m['Foot_'+s].copy() for s in ('L','R')}
    if 6<=f<=68:foot_error=max(matrix_error(m['Foot_'+s],feet[s]) for s in feet)
    hand_map=m['HandPalm_L']@anchor.inverted();lever_error=None;bolt_error=None
    if 26<=f<=46:lever_error=(hand_map@CONTACT-m['LeverHandle'].translation).length
    if f==50:grasp=m['LoadedBolt'].inverted()@hand_map
    if 50<=f<=62:bolt_error=matrix_error(m['LoadedBolt'].inverted()@hand_map,grasp)
    hp,hf=evaluated(hand);ratios=[area(hp,hf[i])/initial[i] for i in ids]
    bp,_=evaluated(body)
    angles=[] if last is None else [math.degrees(last[n].to_quaternion().rotation_difference(m[n].to_quaternion()).angle) for n in ('UpperArm_L','Forearm_L','HandPalm_L')]
    jumps=max((min(angle,360-angle) for angle in angles),default=0)
    rows.append({'frame':f,'wrist_bend':wrist,'bone_length_error_m':max(length_errors),'foot_anchor_error':foot_error,
                 'lever_contact_error_m':lever_error,'bolt_grasp_matrix_error':bolt_error,'min_cuff_area_ratio':min(ratios),
                 'max_cuff_area_ratio':max(ratios),'boot_min_z_m':min(bp[i].z for i in floor_ids),'angular_step_degrees':jumps})
    last=m
summary={'maximum_wrist_bend':max(r['wrist_bend'] for r in rows),'maximum_bone_length_error_m':max(r['bone_length_error_m'] for r in rows),
         'maximum_foot_anchor_error':max(r['foot_anchor_error'] for r in rows),'maximum_lever_contact_error_m':max(r['lever_contact_error_m'] or 0 for r in rows),
         'maximum_bolt_grasp_matrix_error':max(r['bolt_grasp_matrix_error'] or 0 for r in rows),'minimum_cuff_area_ratio':min(r['min_cuff_area_ratio'] for r in rows),
         'maximum_cuff_area_ratio':max(r['max_cuff_area_ratio'] for r in rows),'minimum_boot_z_m':min(r['boot_min_z_m'] for r in rows),
         'maximum_angular_step_degrees':max(r['angular_step_degrees'] for r in rows)}
gates={'wrist':summary['maximum_wrist_bend']<=78,'bone_lengths':summary['maximum_bone_length_error_m']<.0001,
       'feet_planted':summary['maximum_foot_anchor_error']<.0001,'lever_contact':summary['maximum_lever_contact_error_m']<.0005,
       'bolt_rigid_grasp':summary['maximum_bolt_grasp_matrix_error']<.001,'cuff_area':summary['minimum_cuff_area_ratio']>.25,
       'no_floor_penetration':summary['minimum_boot_z_m']>-.003,'no_subframe_flip':summary['maximum_angular_step_degrees']<15}
report={'source_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'sample_count':len(rows),'summary':summary,'gates':gates,'samples':rows,
        'surface_contact_approved':False,'runtime_publish_allowed':False,'scope':'Evaluated source rig and cuff. Full collision, LODs and GLB surface parity remain separate gates.'}
(RUN/'qa/fullbody-deformation.json').write_text(json.dumps(report,indent=2)+'\n',newline='\n')
print('FULLBODY_QA',json.dumps({'summary':summary,'gates':gates}))
