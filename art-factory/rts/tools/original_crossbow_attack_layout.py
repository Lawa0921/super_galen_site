"""Original firing-pose layout in the existing shoulder/arm chain; source untouched."""
import bpy,hashlib,json,math,sys
from pathlib import Path
from mathutils import Matrix,Vector
sys.path.insert(0,str(Path(__file__).parent))
from original_crossbow_attack_probe import ROOT,RUN,SOURCE,EXPECTED,RIGHT,RAIL_REAR,RAIL_FRONT,activate,values
from original_crossbow_carry_solve import arm_matrices,apply_matrices

def shoulder_base(rig,neutral,forward):
    base=neutral.copy()
    for side,sign in [('R',1),('L',-1)]:
        name='Shoulder_'+side;old=neutral[name];target=Vector((sign*.02,forward,.020)).normalized()
        rotation=(old.to_quaternion()@Vector((0,1,0))).rotation_difference(target)@old.to_quaternion()
        base[name]=Matrix.LocRotScale(old.translation,rotation,Vector((1,1,1)));delta=base[name]@old.inverted()
        for part in ['UpperArm','Forearm','Hand']:base[part+'_'+side]=delta@neutral[part+'_'+side]
    return base

def aim_pose(rig,neutral,grip):
    right=Matrix.Translation(Vector(grip)-RIGHT)@rig.data.bones['Hand_R'].matrix_local
    relative=neutral['Hand_R'].inverted()@neutral['Hand_L'];base=shoulder_base(rig,neutral,.145);matrices=base.copy()
    for side,hand,pole in [('R',right,Vector((.48,.20,1.18))),('L',right@relative,Vector((-.45,.24,1.20)))]:
        matrices.update(arm_matrices(rig,base,side,hand,pole))
    return matrices

def render(name):
    scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE';scene.eevee.taa_render_samples=48;scene.render.resolution_x=760;scene.render.resolution_y=860;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.film_transparent=True
    for o in scene.objects:
        if o.type=='MESH':o.hide_render=o.name not in ['crossbowOriginalBody_LOD0','CrossbowWeapon_LOD0','OriginalCrossbowClosedGrip_R','OriginalCrossbowClosedGrip_L']
    camera=scene.camera;camera.data.type='ORTHO';camera.data.ortho_scale=1.9;target=Vector((0,.12,.96))
    for view,position in [('front',(0,4,1.05)),('side',(4,.1,1.05)),('threequarter',(2.9,3.3,1.8))]:
        camera.location=position;camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(RUN/f'qa/layout-{name}-{view}.png');bpy.ops.render.render(write_still=True)

def main():
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==EXPECTED
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE));rig=bpy.data.objects['crossbowRig20'];activate(rig,'Idle',0);neutral={p.name:p.matrix.copy() for p in rig.pose.bones}
    rig.animation_data_clear();rows=[]
    for name,grip in [('lower',(-.02,.26,1.43)),('level',(-.02,.26,1.48)),('higher',(-.02,.245,1.51))]:
        try:
            pose=aim_pose(rig,neutral,grip);apply_matrices(rig,pose);bpy.context.view_layer.update();skin=pose['Hand_R']@rig.data.bones['Hand_R'].matrix_local.inverted()
            rows.append({'name':name,'grip':grip,'reachable':True,'rail_rear':values(skin@RAIL_REAR),'rail_front':values(skin@RAIL_FRONT),'hand_targets':{s:values(pose['Hand_'+s].translation) for s in ['L','R']}});render(name)
        except ValueError as error:rows.append({'name':name,'grip':grip,'reachable':False,'error':str(error)})
    (RUN/'qa/layout.json').write_text(json.dumps(rows,indent=2)+'\n');print('ATTACK_LAYOUT',json.dumps(rows))
    assert any(r['reachable'] for r in rows)
if __name__=='__main__':main()
