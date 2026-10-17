"""Contour-based retopology helpers; geometry proof only, never runtime approval."""

import numpy as np


def align_ring(reference, ring):
    a=np.asarray(reference,dtype=float); b=np.asarray(ring,dtype=float)
    if a.shape!=b.shape or a.ndim!=2 or a.shape[1]!=3:
        raise ValueError('Matching rings required')
    ac=a-a.mean(axis=0);bc=b-b.mean(axis=0)
    costs=[np.sum((ac-np.roll(bc,shift,axis=0))**2) for shift in range(len(b))]
    return np.roll(b,int(np.argmin(costs)),axis=0)


def contour_resample(loop, center, axis, count):
    p=np.asarray(loop,dtype=float)
    center=np.asarray(center,dtype=float)
    u,v,_=plane_basis(axis)
    if count<8 or len(p)<5 or not np.isfinite(p).all() or np.linalg.norm(p[0]-p[-1])>1e-6:
        raise ValueError('Closed finite contour required')
    p=p[:-1]
    xy=np.column_stack(((p-center)@u,(p-center)@v))
    area=np.sum(xy[:,0]*np.roll(xy[:,1],-1)-xy[:,1]*np.roll(xy[:,0],-1))
    if abs(area)<1e-12:
        raise ValueError('Nondegenerate contour required')
    if area<0:
        p=p[::-1];xy=xy[::-1]
    # A source-surface extremum is a stable phase anchor independent of file winding.
    possible=np.flatnonzero(xy[:,0]>=xy[:,0].max()-1e-10)
    anchor=possible[np.argmin(xy[possible,1])]
    p=np.roll(p,-anchor,axis=0)
    p=np.vstack((p,p[0]))
    lengths=np.linalg.norm(np.diff(p,axis=0),axis=1)
    keep=np.r_[True,lengths>1e-12]
    p=p[keep]
    cumulative=np.r_[0,np.cumsum(np.linalg.norm(np.diff(p,axis=0),axis=1))]
    distances=np.arange(count)*cumulative[-1]/count
    return np.column_stack([np.interp(distances,cumulative,p[:,i]) for i in range(3)])


def plane_basis(axis):
    n = np.asarray(axis, dtype=float)
    if n.shape != (3,) or not np.isfinite(n).all() or np.linalg.norm(n) < 1e-12:
        raise ValueError('Nonzero finite plane axis required')
    n = n / np.linalg.norm(n)
    seed = np.array([1.,0.,0.]) if abs(n[0]) < .9 else np.array([0.,1.,0.])
    u = seed - n * np.dot(seed,n)
    u /= np.linalg.norm(u)
    return u, np.cross(n,u), n

def select_local_loop(loops, hint, axis, max_diameter, max_offset):
    u,v,_ = plane_basis(axis)
    hint = np.asarray(hint, dtype=float)
    candidates = []
    for loop in loops:
        p = np.asarray(loop, dtype=float)
        if len(p)<5 or not np.isfinite(p).all() or np.linalg.norm(p[0]-p[-1])>1e-6:
            continue
        center = (p.min(axis=0)+p.max(axis=0))/2
        extent = np.ptp(np.column_stack((p@u,p@v)),axis=0)
        offset = np.linalg.norm(center-hint)
        if max(extent)<=max_diameter and min(extent)>.015 and offset<=max_offset:
            candidates.append((offset,p))
    if not candidates:
        raise ValueError('No local closed contour within anatomical limits')
    return min(candidates,key=lambda item:item[0])[1]

def radial_resample(loop, center, axis, count):
    if count<8:
        raise ValueError('At least eight ring vertices required')
    u,v,_ = plane_basis(axis)
    center = np.asarray(center, dtype=float)
    loop = np.asarray(loop, dtype=float)
    p = np.column_stack(((loop-center)@u,(loop-center)@v))
    if np.linalg.norm(p[0]-p[-1])>1e-6:
        raise ValueError('Closed star-shaped contour required')
    def cross2(a,b):
        return a[...,0]*b[...,1]-a[...,1]*b[...,0]
    start,end=p[:-1],p[1:]
    edges=end-start
    result=[]
    for angle in np.arange(count)*2*np.pi/count:
        ray=np.array([np.cos(angle),np.sin(angle)])
        denominator=cross2(np.broadcast_to(ray,edges.shape),edges)
        valid=np.abs(denominator)>1e-12
        distance=np.divide(cross2(start,edges),denominator,out=np.full(len(edges),-1.),where=valid)
        fraction=np.divide(cross2(start,np.broadcast_to(ray,start.shape)),denominator,out=np.full(len(edges),-1.),where=valid)
        hits=distance[valid & (distance>1e-10) & (fraction>=-1e-9) & (fraction<=1+1e-9)]
        hits=np.unique(np.round(hits,10))
        if len(hits)!=1:
            raise ValueError('Contour is not star-shaped about selected center')
        result.append(center+hits[0]*(np.cos(angle)*u+np.sin(angle)*v))
    return np.asarray(result)

def capped_ring_mesh(rings):
    p=np.asarray(rings, dtype=float)
    if p.ndim!=3 or p.shape[2]!=3 or p.shape[0]<2 or p.shape[1]<8 or not np.isfinite(p).all():
        raise ValueError('Consistent finite rings required')
    rows,n,_=p.shape
    verts=p.reshape(-1,3).tolist()
    verts.extend([p[0].mean(axis=0).tolist(),p[-1].mean(axis=0).tolist()])
    faces=[]
    for row in range(rows-1):
        for i in range(n):
            j=(i+1)%n
            faces.append([row*n+i,row*n+j,(row+1)*n+j,(row+1)*n+i])
    for i in range(n):
        j=(i+1)%n
        faces.append([rows*n,j,i])
        faces.append([rows*n+1,(rows-1)*n+i,(rows-1)*n+j])
    coordinates=np.asarray(verts)
    for face in faces:
        for i in range(1,len(face)-1):
            a,b,c=coordinates[[face[0],face[i],face[i+1]]]
            if np.linalg.norm(np.cross(b-a,c-a))<1e-12:
                raise ValueError('Degenerate triangle in ring mesh')
    return verts,faces

def skin_weights(stations, elbow, half_width):
    if half_width<=0:
        raise ValueError('Positive joint blend width required')
    t=np.clip((np.asarray(stations)-elbow+half_width)/(2*half_width),0,1)
    t=t*t*(3-2*t)
    return np.column_stack((1-t,t))
