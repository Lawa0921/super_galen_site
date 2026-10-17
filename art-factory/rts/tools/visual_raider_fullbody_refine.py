"""Author source-based planted anticipation, whole-body strike and recovery."""
import argparse,json,math,sys
from pathlib import Path
import bpy
from mathutils import Vector,Matrix,Quaternion
sys.path.insert(0,str(Path(__file__).parent))
import procedural_gauntlet_build as g
from original_crossbow_grip_math import solve_two_bone
from visual_priest_staff_refine import capture,restore,write_keys
from visual_hand_rework import mesh_fingerprint

def turn_chain(m,name,q,rig):
    old=m[name];new=Matrix.LocRotScale(old.translation,q@old.to_quaternion(),Vector((1,1,1)));delta=new@old.inverted();m[name]=new
    for child in rig.data.bones[name].children_recursive:m[child.name]=delta@m[child.name]

def translate_chain(m,name,delta,rig):
    transform=Matrix.Translation(Vector(delta));m[name]=transform@m[name]
    for child in rig.data.bones[name].children_recursive:m[child.name]=transform@m[child.name]

def plant_legs(m,neutral,rig,source_poles=False):
    for side,sign in (('L',-1),('R',1)):
        upper,lower,foot=('Thigh_'+side,'Shin_'+side,'Foot_'+side);hip=m[upper].translation.copy();ankle=neutral[foot].translation.copy()
        pole=(m[lower].translation-hip).normalized() if source_poles else Vector((sign*.08,1,0))
        knee,end=map(Vector,solve_two_bone(tuple(hip),tuple(ankle),tuple(pole),rig.data.bones[upper].length,rig.data.bones[lower].length))
        for name,start,finish in ((upper,hip,knee),(lower,knee,end)):
            q=m[name].to_quaternion();q=(q@Vector((0,1,0))).rotation_difference((finish-start).normalized())@q
            m[name]=Matrix.LocRotScale(start,q,Vector((1,1,1)))
        m[foot]=neutral[foot].copy()

def arm(m,rest,side,wrist,target,pole,hand_q=None):
    upper,fore,hand=('UpperArm_'+side,'Forearm_'+side,'Hand_'+side);s0=rest[upper].translation;e0=rest[fore].translation;s=m[upper].translation
    e,w=map(Vector,solve_two_bone(tuple(s),tuple(target),tuple(pole),(e0-s0).length,(wrist-e0).length))
    base=(m[upper]@rest[upper].inverted()).to_quaternion();qu=(base@(e0-s0)).rotation_difference(e-s)@base
    qf=(qu@(wrist-e0)).rotation_difference(w-e)@qu;qh=hand_q if hand_q is not None else qf
    for name,start,bind,q in ((upper,s,s0,qu),(fore,e,e0,qf),(hand,w,wrist,qh)):
        m[name]=Matrix.LocRotScale(start-q@bind,q,Vector((1,1,1)))@rest[name]

def main():
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--run',type=Path,required=True)
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);run=a.run.resolve()
    for folder in ('raw','candidate','qa'):(run/folder).mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(a.source.resolve()));rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');objects=[o for o in bpy.data.objects if o.type=='MESH'];fingerprints={o.name:mesh_fingerprint(o) for o in objects}
    original=capture(rig,'Attack',samples_per_frame=4);restore(rig,original[0]);neutral={b.name:b.matrix.copy() for b in rig.pose.bones};rest={b.name:b.matrix_local.copy() for b in rig.data.bones}
    wrist=Vector((.393500000238,.027882000431,.971826970577));wrists={'R':wrist,'L':Vector((-wrist.x,wrist.y,wrist.z))}
    weapon=bpy.data.objects['RaiderShortAxe_LOD0'];steel={v for poly in weapon.data.polygons if any(x in weapon.data.materials[poly.material_index].name.lower() for x in ('steel','iron')) for v in poly.vertices}
    headvec=sum((weapon.data.vertices[i].co for i in steel),Vector())/len(steel)-wrist
    order=sorted((b.name for b in rig.data.bones),key=lambda n:len(rig.data.bones[n].parent_recursive));names=[n for n in order if n!='Root']
    def apply(m):
        for name in names:rig.pose.bones[name].matrix=m[name];bpy.context.view_layer.update()
    def channels():return {n:(rig.pose.bones[n].location.copy(),rig.pose.bones[n].rotation_quaternion.copy()) for n in names}
    keys={0:channels(),28:channels(),40:channels()}
    poses={
        6:dict(pelvis=(0,-.020,-.025),yaw=-8,lower=4,upper=(-18,6),right=(.45,-.10,1.60),rpole=(1,-.2,-.1),head=(0,-.05,.45),left=(-.42,.20,1.18),lpole=(-1,.3,-.2)),
        13:dict(pelvis=(0,.055,-.045),yaw=12,lower=-8,upper=(24,-14),right=(.40,.55,1.20),rpole=(1,.2,-.2),head=(0,.46,-.12),left=(-.43,-.16,1.30),lpole=(-1,-.2,.1)),
        19:dict(pelvis=(0,.050,-.045),yaw=15,lower=-9,upper=(28,-16),right=(.44,.48,1.05),rpole=(1,.2,-.2),head=(0,.32,-.30),left=(-.43,-.18,1.25),lpole=(-1,-.2,.1)),
    }
    for frame,pose in poses.items():
        restore(rig,original[0]);m={n:v.copy() for n,v in neutral.items()};translate_chain(m,'Pelvis',pose['pelvis'],rig)
        turn_chain(m,'Pelvis',Quaternion((0,0,1),math.radians(pose['yaw'])),rig);turn_chain(m,'SpineLower',Quaternion((1,0,0),math.radians(pose['lower'])),rig)
        turn_chain(m,'SpineUpper',Quaternion((0,0,1),math.radians(pose['upper'][0]))@Quaternion((1,0,0),math.radians(pose['upper'][1])),rig)
        plant_legs(m,neutral,rig);arm(m,rest,'L',wrists['L'],Vector(pose['left']),pose['lpole']);arm(m,rest,'R',wrists['R'],Vector(pose['right']),pose['rpole'],headvec.rotation_difference(Vector(pose['head'])))
        apply(m);keys[frame]=channels()
    desired={};anchors=sorted(keys)
    for frame in original:
        restore(rig,original[0]);lo=max(f for f in anchors if f<=frame);hi=min(f for f in anchors if f>=frame);t=g.smooth((frame-lo)/(hi-lo)) if hi>lo else 0
        for name in names:
            p0,q0=keys[lo][name];p1,q1=keys[hi][name];rig.pose.bones[name].location=p0.lerp(p1,t);rig.pose.bones[name].rotation_quaternion=q0.slerp(q1,t)
        bpy.context.view_layer.update()
        if frame not in (0,28,40):
            m={b.name:b.matrix.copy() for b in rig.pose.bones};plant_legs(m,neutral,rig,source_poles=True)
            for name in ('Thigh_L','Shin_L','Foot_L','Thigh_R','Shin_R','Foot_R'):rig.pose.bones[name].matrix=m[name];bpy.context.view_layer.update()
            for side in 'LR':
                fore=rig.pose.bones['Forearm_'+side];hand=rig.pose.bones['Hand_'+side];w=fore.matrix@rest[fore.name].inverted()@wrists[side];q=(hand.matrix@rest[hand.name].inverted()).to_quaternion()
                hand.matrix=Matrix.LocRotScale(w-q@wrists[side],q,Vector((1,1,1)))@rest[hand.name];bpy.context.view_layer.update()
        desired[frame]=channels()
    write_keys(rig,'Attack',desired)
    for obj in objects:assert mesh_fingerprint(obj)==fingerprints[obj.name],('Generated source geometry changed',obj.name)
    g.set_action(rig,'Idle');bpy.context.scene.frame_set(0);bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(run/'raw/neutral-raider-assembly.blend'))
    for lod in (0,1):g.export_lod(run/'candidate'/('neutral-raider.glb' if lod==0 else 'neutral-raider-lod1.glb'),rig,[o for o in objects if o.name.endswith(f'_LOD{lod}')])
    report={'source':str(a.source),'anchors':anchors,'poses':poses,'hand_blade_bind_axis':list(headvec),'left_wrist_source':'X mirror of measured right wrist','unchanged_mesh_fingerprints':fingerprints,'runtime_publish_allowed':False,'artistic_quality_proven':False}
    (run/'qa/fullbody-build.json').write_text(json.dumps(report,indent=2)+'\n')

if __name__=='__main__':main()
