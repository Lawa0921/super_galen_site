"""Compare physical palm orientations around the actual original support bar."""
import bpy,json,sys,math
from pathlib import Path
from mathutils import Vector,Matrix,Quaternion
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).parent))
from original_crossbow_attack_probe import activate
from original_crossbow_carry_solve import arm_matrices
from original_glove_deformation import evaluated,crossings
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/original-crossbow-articulated-hand/2026-10-07-v1'
BODY=ROOT/'art-factory/rts/runs/original-crossbow-attack/2026-10-06-v1/candidate/original-crossbow-grip.blend'
bpy.ops.wm.open_mainfile(filepath=str(BODY));rig=bpy.data.objects['crossbowRig20'];activate(rig,'Idle',0);relative=rig.pose.bones['Forearm_L'].matrix.inverted()@rig.pose.bones['Hand_L'].matrix
bpy.ops.wm.open_mainfile(filepath=str(RUN/'candidate/articulated-crossbow.blend'));rig=bpy.data.objects['crossbowRig20'];activate(rig,'Idle',0);original={p.name:p.matrix.copy() for p in rig.pose.bones}
meta=json.loads((RUN/'qa/attachment-preflight.json').read_text());anchor=Matrix(meta['source_bones']['Hand_L']['matrix']);weapon_data=json.loads((ROOT/'art-factory/rts/runs/original-glove-weapon-fit/2026-10-07-v1/raw/weapon.json').read_text())
skin=original['Hand_R']@rig.data.bones['Hand_R'].matrix_local.inverted();center=skin@Vector(weapon_data['support_center_source']);axis=skin.to_3x3()@Vector(weapon_data['support_axis_source'])
hand=bpy.data.objects['OriginalCrossbowArticulatedHand_L'];weapon=bpy.data.objects['CrossbowWeapon_LOD0'];wp,wf=evaluated(weapon);wt=BVHTree.FromPolygons(wp,wf,all_triangles=True)
scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE';scene.eevee.taa_render_samples=32;scene.render.resolution_x=900;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
for obj in scene.objects:
    if obj.type=='MESH':obj.hide_render=obj.name not in ['crossbowOriginalBody_LOD0','CrossbowWeapon_LOD0','OriginalCrossbowClosedGrip_R',hand.name]
camera=scene.camera;camera.data.type='ORTHO';camera.data.ortho_scale=1.15;aim=Vector((0,.18,1.20));camera.location=aim+Vector((2.8,3.5,1.6));camera.rotation_euler=(aim-camera.location).to_track_quat('-Z','Y').to_euler()
rows=[]
rig.animation_data.action=None
for track in rig.animation_data.nla_tracks:track.mute=True
angles=[float(v) for v in sys.argv[sys.argv.index('--angles')+1].split(',')] if '--angles' in sys.argv else [0,45,90,135,180,-45,-90,-135]
for degrees in angles:
    turn=Matrix.Translation(center)@Quaternion(axis,math.radians(degrees)).to_matrix().to_4x4()@Matrix.Translation(-center)
    wrist=turn@original['HandPalm_L'];row={'degrees':degrees,'wrist':list(wrist.translation)}
    try:left=arm_matrices(rig,original,'L',wrist,Vector((-.3,.12,.98)))
    except ValueError as error:row.update(reachable=False,reason=str(error));rows.append(row);continue
    left['Hand_L']=left['Forearm_L']@relative
    matrices={**original,**left,**{n:turn@m for n,m in original.items() if n=='HandPalm_L' or n.startswith(('Index','Middle','Ring','Little','Thumb'))}}
    for p in rig.pose.bones:
        if p.parent:p.matrix_basis=p.bone.convert_local_to_pose(matrices[p.name],p.bone.matrix_local,invert=True,parent_matrix=matrices[p.parent.name],parent_matrix_local=p.parent.bone.matrix_local)
        else:p.matrix_basis=p.bone.convert_local_to_pose(matrices[p.name],p.bone.matrix_local,invert=True)
    bpy.context.view_layer.update();hp,hf=evaluated(hand);tree=BVHTree.FromPolygons(hp,hf,all_triangles=True)
    hits=[(i,j) for i,j in tree.overlap(wt) if crossings([hp[k] for k in hf[i]],[wp[k] for k in wf[j]])]
    forward=(wrist@anchor.inverted()).to_3x3()@Vector((0,0,1));fore=wrist.translation-left['Forearm_L'].translation
    row.update(reachable=True,elbow=list(left['Forearm_L'].translation),forearm_palm_bend_degrees=math.degrees(fore.angle(forward)),hand_weapon=len(hits))
    scene.render.filepath=str(RUN/f'qa/orientation-{degrees}.png');bpy.ops.render.render(write_still=True);rows.append(row)
(RUN/('qa/orientation-refined.json' if '--angles' in sys.argv else 'qa/orientation-comparison.json')).write_text(json.dumps({'rows':rows,'runtime_publish_allowed':False},indent=2)+'\n');print('ORIENTATION',json.dumps(rows))
