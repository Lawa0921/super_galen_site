"""Original guard portrait controls in the established +Z-up canonical space."""
import math
import numpy as np

def smoothstep(a,b,value):
    t=np.clip((value-a)/(b-a),0,1)
    return t*t*(3-2*t)

def portrait_weights(points):
    points=np.asarray(points,float)
    if points.ndim!=2 or points.shape[1]!=3 or not np.isfinite(points).all():
        raise ValueError('Expected finite Nx3 canonical positions')
    # Spatial controls keep the upper helmet region rigid and blend a central
    # lower band. This is not semantic proof that the entire helmet skirt is rigid.
    neck=smoothstep(1.535,1.59,points[:,2])*(1-smoothstep(.12,.18,np.abs(points[:,0])))
    head=np.where(points[:,2]>=1.64,1.,neck)
    return np.column_stack((1-head,head))

def portrait_motion(frame,period=120):
    if not math.isfinite(frame) or not math.isfinite(period) or period<=0:
        raise ValueError('Finite frame and positive period required')
    phase=(frame%period)/period*2*math.pi
    return {'chest':[math.radians(.35)*math.sin(phase),0.,0.],
            'head':[math.radians(1.5)*(1-math.cos(phase)),math.radians(1.2)*math.sin(phase),math.radians(8)*math.sin(phase)]}
