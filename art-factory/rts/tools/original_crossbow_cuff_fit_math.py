"""Fit the retained sleeve to the actual sculpted wrist section."""
import numpy as np


def boundary_point(ring,direction):
    ring=np.asarray(ring,dtype=float);direction=np.asarray(direction,dtype=float)
    if ring.ndim!=2 or ring.shape[1]!=3 or len(ring)<3 or direction.shape!=(2,) or not np.isfinite(ring).all() or not np.isfinite(direction).all() or np.linalg.norm(direction)<1e-12:
        raise ValueError('A finite closed section and nonzero direction are required')
    direction=direction/np.linalg.norm(direction);hits=[]
    for a,b in zip(ring,np.roll(ring,-1,axis=0)):
        matrix=np.column_stack((direction,-(b-a)[:2]))
        if abs(np.linalg.det(matrix))<1e-12:continue
        distance,t=np.linalg.solve(matrix,a[:2])
        if distance>0 and -1e-8<=t<=1+1e-8:hits.append((distance,a+(b-a)*t))
    if not hits:raise ValueError('The ray does not intersect the actual wrist section')
    return min(hits,key=lambda p:p[0])[1]


def palm_weight(distance,limit):
    if limit<=0 or distance<0:raise ValueError('Invalid sleeve distance')
    t=min(distance/limit,1.)
    return 1-t*t*(3-2*t)
