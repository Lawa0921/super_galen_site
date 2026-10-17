"""Hard elbow plates must follow their bone without rubber-like axial twist."""
import argparse,json,math,sys
from pathlib import Path
import bpy,numpy as np
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).parent))
import procedural_gauntlet_build as g
from visual_knight_motion_test import positions
WRISTS={'L':Vector((-.434176,-.046531,.911712)),'R':Vector((.409796,.089432,.902662))}

def armor_core(body,rig,side,part='UpperArm'):
    armor={i for p in body.data.polygons if body.data.materials[p.material_index].name.startswith('GuardArmor') for i in p.vertices}
    upper=rig.data.bones['UpperArm_'+side];fore=rig.data.bones['Forearm_'+side]
    axis=((upper.head_local if part=='UpperArm' else WRISTS[side])-fore.head_local).normalized();elbow=fore.head_local
    return [i for i in armor if .03<(body.data.vertices[i].co-elbow).dot(axis)<.16 and ((body.data.vertices[i].co-elbow)-axis*(body.data.vertices[i].co-elbow).dot(axis)).length<.12]

def twist_degrees(rig,side):
    upper=rig.pose.bones['UpperArm_'+side];fore=rig.pose.bones['Forearm_'+side]
    axis=(WRISTS[side]-fore.bone.head_local).normalized()
    upper_skin=(upper.matrix@upper.bone.matrix_local.inverted()).to_quaternion()
    fore_skin=(fore.matrix@fore.bone.matrix_local.inverted()).to_quaternion()
    expected=(upper_skin@axis).rotation_difference(fore_skin@axis)@upper_skin
    angle=expected.rotation_difference(fore_skin).angle
    return math.degrees(min(angle,2*math.pi-angle))

def main():
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--report',type=Path,required=True);p.add_argument('--reference',type=Path,required=True)
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);reference={}
    bpy.ops.wm.open_mainfile(filepath=str(a.reference.resolve()));ref_rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');g.set_action(ref_rig,'Death');ref_action=bpy.data.actions['Death']
    frames=np.linspace(*ref_action.frame_range,1+int(ref_action.frame_range[1]-ref_action.frame_range[0])*4)
    for frame in frames:
        bpy.context.scene.frame_set(int(frame),subframe=float(frame%1))
        reference[float(frame)]={s:ref_rig.matrix_world@ref_rig.pose.bones['Forearm_'+s].matrix@ref_rig.data.bones['Forearm_'+s].matrix_local.inverted()@WRISTS[s] for s in 'LR'}
    bpy.ops.wm.open_mainfile(filepath=str(a.source.resolve()))
    rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');bodies=[o for o in bpy.data.objects if o.name.startswith('GuardBody_')]
    regions={(o.name,s,part):armor_core(o,rig,s,part) for o in bodies for s in 'LR' for part in ('UpperArm','Forearm')};failures=[];rows=[]
    assert all(len(ids)>10 for ids in regions.values()),'Missing original armor plate core'
    g.set_action(rig,'Death');action=bpy.data.actions['Death'];maximum_twist={s:0 for s in 'LR'};maximum_error={key:0 for key in regions};maximum_wrist_error={s:0 for s in 'LR'}
    for frame in np.linspace(*action.frame_range,1+int(action.frame_range[1]-action.frame_range[0])*4):
        bpy.context.scene.frame_set(int(frame),subframe=float(frame%1))
        for side in 'LR':
            maximum_twist[side]=max(maximum_twist[side],twist_degrees(rig,side))
            fore=rig.pose.bones['Forearm_'+side];wrist=rig.matrix_world@fore.matrix@fore.bone.matrix_local.inverted()@WRISTS[side]
            maximum_wrist_error[side]=max(maximum_wrist_error[side],(wrist-reference[float(frame)][side]).length)
        for body in bodies:
            points=positions(body)
            for side in 'LR':
                for part in ('UpperArm','Forearm'):
                    b=rig.pose.bones[part+'_'+side];matrix=rig.matrix_world@b.matrix@b.bone.matrix_local.inverted();key=(body.name,side,part)
                    maximum_error[key]=max(maximum_error[key],max((Vector(points[i])-matrix@body.data.vertices[i].co).length for i in regions[key]))
    for (name,side,part),error in maximum_error.items():
        rows.append({'mesh':name,'side':side,'part':part,'hard_plate_vertices':len(regions[name,side,part]),'maximum_rigid_plate_error_m':error})
        if error>.003:failures.append(name+'/'+side+'/'+part+': hard armor plate deviates over 3mm from its bone')
    for side,angle in maximum_twist.items():
        if angle>30:failures.append(side+': forearm twist exceeds 30 degrees during supported fall')
    for side,error in maximum_wrist_error.items():
        if error>.001:failures.append(side+': actual cut wrist separates from its original hand attachment by over 1mm')
    report={'source':str(a.source),'reference':str(a.reference),'plates':rows,'maximum_forearm_twist_degrees':maximum_twist,'maximum_anatomical_wrist_error_m':maximum_wrist_error,'failures':failures}
    a.report.parent.mkdir(parents=True,exist_ok=True);a.report.write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report));assert not failures,'; '.join(failures)

if __name__=='__main__':main()
