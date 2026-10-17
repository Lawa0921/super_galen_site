"""Local source-surface miter offsets; never alter the preserved outer vertices.

Incident face-normal thickness is constrained to 75–125% of the target and
displacement is bounded. These local constraints do not prove global collision
freedom: the resulting shell still needs real surface and posed intersection QA.
"""
import numpy as np
from scipy.optimize import minimize, LinearConstraint


def miter_offsets(outer, faces, selected, thickness, max_displacement):
    outer=np.asarray(outer,dtype=float);faces=np.asarray(faces,dtype=int)
    if (outer.ndim!=2 or outer.shape[1]!=3 or not np.isfinite(outer).all() or
        faces.ndim!=2 or faces.shape[1]!=3 or not len(faces) or
        np.any(faces<0) or np.any(faces>=len(outer))):
        raise ValueError('finite triangle surface required')
    if not 0<thickness<=max_displacement or not np.isfinite(max_displacement):
        raise ValueError('positive thickness and bounded displacement required')
    normals=np.cross(outer[faces[:,1]]-outer[faces[:,0]],outer[faces[:,2]]-outer[faces[:,0]])
    lengths=np.linalg.norm(normals,axis=1)
    if np.any(lengths<1e-14):raise ValueError('degenerate surface triangle')
    normals/=lengths[:,None]
    offsets=np.zeros_like(outer)
    for index in selected:
        if not isinstance(index,(int,np.integer)) or not 0<=index<len(outer):
            raise ValueError('valid selected vertex index required')
        local=normals[np.any(faces==index,axis=1)]
        if not len(local):raise ValueError('selected vertex has no incident surface')
        start=np.linalg.lstsq(local,-np.ones(len(local)),rcond=None)[0]
        limit=max_displacement/thickness
        objective=lambda d:float(np.mean((local@d+1)**2)+1e-10*np.dot(d,d))
        result=minimize(objective,start,method='SLSQP',constraints=[
            LinearConstraint(local,-1.25,-.75),
            {'type':'ineq','fun':lambda d:limit**2-np.dot(d,d)}],
            options={'ftol':1e-12,'maxiter':120})
        d=result.x;projection=local@d
        if (not result.success or np.any(projection< -1.250001) or
            np.any(projection>-.749999) or np.linalg.norm(d)>limit+1e-6):
            raise ValueError(f'no feasible local thickness at vertex {index}: {result.message}')
        offsets[index]=d*thickness
    return offsets


def repair_inner_layer(vertices, outer_faces, selected, thickness=.002, max_displacement=.006):
    vertices=np.asarray(vertices,dtype=float)
    if len(vertices)%2:raise ValueError('matching outer and inner vertex layers required')
    count=len(vertices)//2;selected=list(selected)
    offsets=miter_offsets(vertices[:count],outer_faces,selected,thickness,max_displacement)
    result=vertices.copy()
    result[count+np.asarray(selected,dtype=int)]=vertices[selected]+offsets[selected]
    return result
