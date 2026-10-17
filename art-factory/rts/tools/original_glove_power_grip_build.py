"""Assemble pinned original meshes and author weapon-specific local motion."""
import bpy, json, sys, hashlib, math
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion
from mathutils.bvhtree import BVHTree
sys.path.insert(0, str(Path(__file__).parent))
import original_glove_joint_rig as pose
from original_glove_build import apply
from original_glove_deformation import evaluated, crossings

ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/original-glove-power-grip/2026-10-07-v1'
HAND=ROOT/'art-factory/rts/runs/original-glove-joints/2026-10-07-v2/candidate/joint-rig.blend'
WEAPON=ROOT/'art-factory/rts/runs/original-crossbow-weapon/2026-10-06-v1/candidate/original-crossbow-grip.blend'
target=json.loads((RUN/'raw/grip-target.json').read_text())
raw=json.loads((RUN/'raw/weapon.json').read_text())
assert hashlib.sha256(HAND.read_bytes()).hexdigest()==target['hand_source_sha256']
assert hashlib.sha256(WEAPON.read_bytes()).hexdigest()==target['weapon_source_sha256']
bpy.ops.wm.open_mainfile(filepath=str(HAND))
rig=bpy.data.objects['OriginalHandRig_L']; hand=bpy.data.objects['OriginalJointGlove_L_LOD0']
binding=json.loads((RUN/'raw/hand.json').read_text())
for group in hand.vertex_groups:group.remove(list(range(len(hand.data.vertices))))
for i,weights in enumerate(binding['weights']):
    for name,weight in weights.items():hand.vertex_groups[name].add([i],weight,'REPLACE')
rig.animation_data_clear()
for action in list(bpy.data.actions): bpy.data.actions.remove(action)
for o in list(bpy.context.scene.objects):
    if o not in (rig,hand): bpy.data.objects.remove(o,do_unlink=True)
with bpy.data.libraries.load(str(WEAPON),link=False) as (src,dst):
    dst.objects=['CrossbowWeapon_LOD0']
weapon=dst.objects[0]; bpy.context.scene.collection.objects.link(weapon)
weapon.parent=None;weapon.modifiers.clear();weapon.matrix_world=Matrix.Identity(4)
weapon.animation_data_clear();weapon.name='OriginalContactCrossbow'
# Appending the weapon also appends its old rig action. This assembly owns one
# new hand action; do not let glTF retarget an unrelated original character Idle.
for action in list(bpy.data.actions):bpy.data.actions.remove(action)
rotation=Matrix(target['support_rotation_hand_rows']);center=Vector(target['support_center_hand_m'])
assert len(weapon.data.vertices)==len(raw['points_centered_in_hand_basis'])
for v,p in zip(weapon.data.vertices,raw['points_centered_in_hand_basis']):v.co=rotation@Vector(p)+center
def pose_matrices(amount):
    matrices={'Hand_L':rig.data.bones['Hand_L'].matrix_local.copy()}
    for name,angles in target['angles_degrees'].items():
        head=rig.data.bones[name+'1_L'].head_local.copy();rotation=Quaternion()
        swing=target.get('root_swings',{}).get(name)
        if swing:
            opening=target.get('opening_root_swings',{}).get(name,{'degrees':0})
            rotation=Quaternion(Vector(swing['axis']),math.radians(swing['degrees']*amount+opening['degrees']*(1-amount)))
        curl_amount=amount if name!='Thumb' else target.get('opening_thumb_curl_multiplier',0)*(1-amount)+amount
        for i,angle in enumerate(angles,1):
            bone=rig.data.bones[f'{name}{i}_L'];rotation=rotation@Quaternion(Vector(bone['original_flexion_axis']),math.radians(angle)*curl_amount)
            q=rotation@bone.matrix_local.to_quaternion();matrices[bone.name]=Matrix.LocRotScale(head,q,Vector((1,1,1)));head+=q@Vector((0,bone.length,0))
    offset=Vector(target.get('opening_hand_offset_m',[0,0,0]))*(1-amount)
    for matrix in matrices.values():matrix.translation+=offset
    return matrices
scene=bpy.context.scene;scene.frame_start=0;scene.frame_end=48;scene.render.fps=24
action=bpy.data.actions.new('SupportGrip');rig.animation_data_create();rig.animation_data.action=action
previous={}
for sample in range(193):
    frame=sample/4;t=max(0,min(1,frame/18)) if frame<18 else 1 if frame<=24 else max(0,1-(frame-24)/18)
    amount=t*t*(3-2*t);apply(rig,pose_matrices(amount))
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
scene.frame_set(18);bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=str(RUN/'candidate/support-grip.blend'))
wp,wf=evaluated(weapon);wt=BVHTree.FromPolygons(wp,wf,all_triangles=True)
sf=[f for f,name in zip(raw['faces'],raw['face_parts']) if name=='support_grip']
st=BVHTree.FromPolygons(wp,sf,all_triangles=True);rows=[]
for sample in range(385):
    frame=sample/8;scene.frame_set(int(frame),subframe=frame%1);bpy.context.view_layer.update()
    hp,hf=evaluated(hand);ht=BVHTree.FromPolygons(hp,hf,all_triangles=True)
    self_pairs=[[a,b] for a,b in ht.overlap(ht) if a<b and len(set(hf[a])&set(hf[b]))<2 and crossings([hp[i] for i in hf[a]],[hp[i] for i in hf[b]])]
    weapon_pairs=[[a,b] for a,b in ht.overlap(wt) if crossings([hp[i] for i in hf[a]],[wp[i] for i in wf[b]])]
    row={'frame':frame,'hand_self_crossings':len(self_pairs),'full_weapon_crossings':len(weapon_pairs),'self_triangle_pairs':self_pairs[:20],'weapon_triangle_pairs':weapon_pairs[:20]}
    if frame in (0,9,18):
        row['pad_nearest_grip_m']={name:[st.find_nearest(hp[i])[3] for i in ids] for name,ids in target['contact_vertex_ids'].items()}
        row['weapon_parts_hit']=sorted(set(raw['face_parts'][b] for a,b in weapon_pairs))
    rows.append(row)
report={'source_hand_sha256':target['hand_source_sha256'],'source_weapon_sha256':target['weapon_source_sha256'],'candidate_sha256':hashlib.sha256((RUN/'candidate/support-grip.blend').read_bytes()).hexdigest(),'poses':rows,'pass':all(r['hand_self_crossings']==0 and r['full_weapon_crossings']==0 for r in rows),'scope':'385 actual Blender poses including inter-key samples, noncoplanar triangle crossings excluding shared hand edges. Closest pad-to-actual-support triangle distances at three states. Does not prove pressure, contact normals, coplanar overlaps or art acceptance.','runtime_publish_allowed':False}
(RUN/'qa/actual-surface.json').write_text(json.dumps(report,indent=2)+'\n')
print('ACTUAL_SURFACE',json.dumps({'pass':report['pass'],'poses':len(rows),'failed':sum(bool(r['hand_self_crossings'] or r['full_weapon_crossings']) for r in rows),'hold':next(r for r in rows if r['frame']==18)}),flush=True)
scene.frame_set(18);bpy.context.view_layer.update()
if '--no-render' not in sys.argv:
    scene.render.engine='BLENDER_EEVEE';scene.eevee.taa_render_samples=48
    scene.render.resolution_x=1024;scene.render.resolution_y=900;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG'
    world=bpy.data.worlds.new('ContactReview');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.065,.085,.080,1);world.node_tree.nodes['Background'].inputs[1].default_value=.5;scene.world=world
    for name,loc,power,size in [('Key',(-.16,-.24,.28),1.8,.22),('Fill',(.22,-.05,.18),.8,.16),('Rim',(.04,.20,.20),1.2,.20)]:
        d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,.09))-o.location).to_track_quat('-Z','Y').to_euler()
    camera=bpy.data.objects.new('ContactCamera',bpy.data.cameras.new('ContactCamera'));scene.collection.objects.link(camera);scene.camera=camera;camera.data.type='ORTHO'
    for name,loc,scale,aim in [('palm',(0,-.4,.09),.26,(0,0,.085)),('back',(0,.4,.09),.26,(0,0,.085)),('side',(.4,0,.09),.26,(0,0,.085)),('threequarter',(.24,-.32,.24),.28,(0,0,.085)),('whole',(.65,-.9,.8),.95,(.03,.03,.10))]:
        camera.data.ortho_scale=scale;camera.location=loc;camera.rotation_euler=(Vector(aim)-camera.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(RUN/f'qa/hold-{name}.png');bpy.ops.render.render(write_still=True)
print('BUILD_COMPLETE',flush=True)
