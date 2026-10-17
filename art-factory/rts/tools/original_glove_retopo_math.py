"""Deterministic sampling of the original sculpt's actual closed cross sections."""
import numpy as np

def radial_samples(loop,angles):
    loop=np.asarray(loop,dtype=float)
    if np.linalg.norm(loop[0]-loop[-1])>1e-10:loop=np.vstack([loop,loop[0]])
    p=loop[:-1];edge=loop[1:]-p
    cross=lambda a,b:a[...,0]*b[...,1]-a[...,1]*b[...,0]
    result=[]
    for angle in angles:
        ray=np.array([np.cos(angle),np.sin(angle)])
        den=cross(ray,edge);valid=np.abs(den)>1e-12
        t=np.divide(cross(p,edge),den,out=np.zeros(len(p)),where=valid)
        s=np.divide(cross(p,ray),den,out=np.zeros(len(p)),where=valid)
        hit=valid&(t>0)&(s>=-1e-8)&(s<=1+1e-8)
        if not hit.any():raise ValueError('section does not enclose every sampling ray')
        result.append(ray*t[hit].min())
    return np.asarray(result)

def smooth(t):
    t=np.clip(t,0,1);return t*t*(3-2*t)
