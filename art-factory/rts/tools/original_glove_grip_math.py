"""Original hand forward kinematics for contact-target authoring."""
import numpy as np

def rotation(axis,degrees):
    axis=np.asarray(axis,float);axis/=np.linalg.norm(axis);x,y,z=axis
    skew=np.array([[0,-z,y],[z,0,-x],[-y,x,0]]);angle=np.deg2rad(degrees)
    return np.eye(3)+np.sin(angle)*skew+(1-np.cos(angle))*(skew@skew)

def kinematics(data,angles,root_swings=None):
    result={'Hand_L':(np.eye(3),np.zeros(3))}
    for digit in [name[:-3] for name in data['bones'] if name.endswith('1_L')]:
        head=np.array(data['bones'][digit+'1_L']['head'],float);cumulative=np.eye(3)
        swing=(root_swings or {}).get(digit)
        if swing:cumulative=rotation(swing['axis'],swing['degrees'])
        for i,angle in enumerate(angles.get(digit,[0,0,0]),1):
            bone=data['bones'][f'{digit}{i}_L'];rest=np.asarray(bone['head']);cumulative=cumulative@rotation(bone['axis'],angle)
            result[f'{digit}{i}_L']=(cumulative.copy(),head-cumulative@rest)
            head=head+cumulative@(np.asarray(bone['tail'])-rest)
    return result

def deform(data,angles,root_swings=None):
    points=np.asarray(data['points'],float);result=np.zeros_like(points)
    if '_weights' not in data:data['_weights']={name:np.array([w.get(name,0) for w in data['weights']])[:,None] for name in data['bones']}
    for name,(matrix,offset) in kinematics(data,angles,root_swings).items():result+=(points@matrix.T+offset)*data['_weights'][name]
    return result
