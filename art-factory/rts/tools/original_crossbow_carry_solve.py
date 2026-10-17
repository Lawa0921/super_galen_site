"""Exact two-segment original arm pose solver; never stretch unreachable arms."""
import math
from mathutils import Matrix, Vector, Quaternion


def protract_shoulders(rig, original, degrees):
    result=original.copy()
    chest=original['SpineUpper']@rig.data.bones['SpineUpper'].matrix_local.inverted()
    q=chest.to_quaternion()
    for side,sign in [('R',1),('L',-1)]:
        name='Shoulder_'+side;old=original[name]
        rotation=q@Quaternion((0,0,1),sign*math.radians(degrees))@q.inverted()@old.to_quaternion()
        result[name]=Matrix.LocRotScale(old.translation,rotation,Vector((1,1,1)))
        delta=result[name]@old.inverted()
        for part in ('UpperArm','Forearm','Hand'):result[part+'_'+side]=delta@original[part+'_'+side]
    return result


def arm_matrices(rig, original, side, hand, pole):
    upper='UpperArm_'+side;fore='Forearm_'+side
    shoulder=original[upper].translation;wrist=hand.translation
    a=rig.data.bones[upper].length;b=rig.data.bones[fore].length
    delta=wrist-shoulder;distance=delta.length
    if distance>=a+b-1e-5 or distance<=abs(a-b)+1e-5:
        raise ValueError(f'{side} wrist target outside unstretched reach: {distance:.6f}, range {abs(a-b):.6f}..{a+b:.6f}')
    axis=delta.normalized();plane=pole-shoulder;plane=(plane-axis*plane.dot(axis)).normalized()
    axial=(distance*distance+a*a-b*b)/(2*distance)
    height=math.sqrt(max(0,a*a-axial*axial));elbow=shoulder+axis*axial+plane*height
    result={}
    for name,start,end in [(upper,shoulder,elbow),(fore,elbow,wrist)]:
        old=original[name].to_quaternion();old_axis=old@Vector((0,1,0));new_axis=(end-start).normalized()
        rotation=old_axis.rotation_difference(new_axis)@old
        result[name]=Matrix.LocRotScale(start,rotation,Vector((1,1,1)))
    result['Hand_'+side]=hand
    return result


def apply_matrices(rig, matrices):
    for name in ('Shoulder_R','UpperArm_R','Forearm_R','Hand_R','Shoulder_L','UpperArm_L','Forearm_L','Hand_L'):
        pb=rig.pose.bones[name]
        pb.matrix_basis=pb.bone.convert_local_to_pose(matrices[name],pb.bone.matrix_local,invert=True,
            parent_matrix=matrices[pb.parent.name],parent_matrix_local=pb.parent.bone.matrix_local)
